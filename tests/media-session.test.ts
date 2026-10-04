import { describe, expect, it, vi } from "vitest";
import {
  SESSION_ACTIONS,
  artworkFor,
  createActionGate,
  createMediaSessionBridge,
  type MediaSessionLike,
  type SessionAction,
} from "../src/media-session";

function fakeSession(unsupported: SessionAction[] = []) {
  const handlers = new Map<SessionAction, (() => void) | null>();
  const session: MediaSessionLike = {
    metadata: null,
    playbackState: "none",
    setActionHandler(action, handler) {
      if (unsupported.includes(action)) throw new TypeError("unsupported");
      handlers.set(action, handler);
    },
  };
  return { session, handlers };
}

const noop = Object.fromEntries(SESSION_ACTIONS.map((a) => [a, () => undefined])) as Record<SessionAction, () => void>;

describe("createMediaSessionBridge (#362)", () => {
  it("регистрирует обработчики; неподдерживаемое действие не мешает остальным", () => {
    const { session, handlers } = fakeSession(["seekforward"]);
    const next = vi.fn();
    createMediaSessionBridge(session, (m) => m, { ...noop, nexttrack: next });
    expect(handlers.has("seekforward")).toBe(false);
    expect(handlers.has("play")).toBe(true);
    handlers.get("nexttrack")?.();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("карточка: канал, передача, логотип; повтор не пересоздаёт метаданные", () => {
    const { session } = fakeSession();
    const create = vi.fn((m: unknown) => m);
    const bridge = createMediaSessionBridge(session, create, noop);
    bridge.update({ title: "Первый", artist: "Новости", artwork: "https://cdn/logo.png" });
    expect(session.metadata).toEqual({ title: "Первый", artist: "Новости", album: "IPTV Hub", artwork: [{ src: "https://cdn/logo.png" }] });
    bridge.update({ title: "Первый", artist: "Новости", artwork: "https://cdn/logo.png" });
    expect(create).toHaveBeenCalledTimes(1);
    bridge.update({ title: "Первый", artist: "Погода", artwork: "https://cdn/logo.png" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("состояние воспроизведения и снятие карточки при закрытии", () => {
    const { session } = fakeSession();
    const bridge = createMediaSessionBridge(session, (m) => m, noop);
    bridge.update({ title: "A", artist: "", artwork: null });
    bridge.setPlaying(true);
    expect(session.playbackState).toBe("playing");
    bridge.setPlaying(false);
    expect(session.playbackState).toBe("paused");
    bridge.clear();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");
    // после закрытия та же карточка ставится заново
    bridge.update({ title: "A", artist: "", artwork: null });
    expect(session.metadata).not.toBeNull();
  });

  it("без MediaSession ничего не падает", () => {
    const bridge = createMediaSessionBridge(null, (m) => m, noop);
    expect(() => {
      bridge.update({ title: "A", artist: "", artwork: null });
      bridge.setPlaying(true);
      bridge.clear();
    }).not.toThrow();
  });
});

describe("artworkFor", () => {
  it("только https и data-изображения", () => {
    expect(artworkFor("https://cdn/l.png")).toEqual([{ src: "https://cdn/l.png" }]);
    expect(artworkFor("data:image/png;base64,AAAA")).toHaveLength(1);
    expect(artworkFor("http://cdn/l.png")).toEqual([]);
    expect(artworkFor(null)).toEqual([]);
  });
});

describe("createActionGate", () => {
  it("повтор того же действия в окне отбрасывается, другое действие проходит", () => {
    let t = 0;
    const allow = createActionGate(300, () => t);
    expect(allow("next")).toBe(true);
    t = 100;
    expect(allow("next")).toBe(false);
    expect(allow("pause")).toBe(true);
    t = 500;
    expect(allow("pause")).toBe(true);
    t = 900;
    expect(allow("next")).toBe(true);
  });
});
