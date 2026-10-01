import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Player } from "../src/player";
import { DEFAULT_PLAYER_SETTINGS } from "../src/player-settings";

const instances = vi.hoisted(() => [] as Array<{
  source: string;
  config: unknown;
  handlers: Map<string, (event: string, data: unknown) => void>;
  destroy: ReturnType<typeof vi.fn>;
  startLoad: ReturnType<typeof vi.fn>;
}>);
vi.mock("hls.js", () => ({ default: class {
  static isSupported = () => true;
  static Events = { ERROR: "error", FRAG_LOADED: "fragment", MANIFEST_PARSED: "manifest" };
  static ErrorTypes = { NETWORK_ERROR: "network", MEDIA_ERROR: "media" };
  source = "";
  config: unknown;
  handlers = new Map<string, (event: string, data: unknown) => void>();
  destroy = vi.fn();
  startLoad = vi.fn();
  recoverMediaError = vi.fn();
  constructor(config: unknown) { this.config = config; instances.push(this); }
  loadSource(url: string) { this.source = url; }
  attachMedia() {}
  on(event: string, handler: (event: string, data: unknown) => void) { this.handlers.set(event, handler); }
} }));

beforeEach(() => { vi.stubGlobal("window", { location: { href: "https://app.test/" } }); });
afterEach(() => { vi.unstubAllGlobals(); instances.length = 0; });

function fixture() {
  const handlers = new Map<string, () => void>();
  const media = {
    paused: false, src: "", error: null as { code: number; message: string } | null,
    addEventListener: (name: string, handler: () => void) => handlers.set(name, handler),
    removeAttribute: vi.fn(), load: vi.fn(), play: vi.fn(() => Promise.resolve()),
  };
  const toast = vi.fn();
  const fatal = vi.fn();
  const stateChanged = vi.fn();
  const mirrorChanged = vi.fn();
  let settings = { ...DEFAULT_PLAYER_SETTINGS };
  const player = new Player(media as unknown as HTMLVideoElement, toast, stateChanged, fatal, () => settings, mirrorChanged);
  return { player, media, toast, fatal, mirrorChanged, stateChanged, settings: (value: typeof settings) => { settings = value; }, nativeError: () => { media.error = { code: 4, message: "Unsupported" }; handlers.get("error")!(); } };
}

describe("Player mirror fallback", () => {
  it("silently falls back on a fatal HLS error, preserving the launch settings", () => {
    const f = fixture();
    f.player.play({ url: "https://bad/live.m3u8", mirrors: ["https://good/live.m3u8"] });
    f.settings({ ...DEFAULT_PLAYER_SETTINGS, maxBufferLength: 300 });
    instances[0]!.handlers.get("error")!("error", { fatal: true, type: "network" });
    expect(instances[0]!.destroy).toHaveBeenCalledOnce();
    expect(instances[1]!.source).toBe("https://good/live.m3u8");
    expect(instances[1]!.config).toMatchObject({ maxBufferLength: 30 });
    expect(f.toast).not.toHaveBeenCalled();
    expect(f.fatal).not.toHaveBeenCalled();
    expect(f.mirrorChanged).toHaveBeenCalledOnce();
    expect(f.stateChanged).toHaveBeenCalledOnce();
    instances[0]!.handlers.get("error")!("error", { fatal: true, type: "network" });
    expect(instances).toHaveLength(2); // позднее событие старого источника
    f.player.play({ url: "https://bad/live.m3u8", mirrors: ["https://good/live.m3u8"] });
    expect(instances).toHaveLength(2); // основной URL остаётся идентификатором
  });
  it("ignores nonfatal errors and reports exhaustion without cycling", () => {
    const f = fixture();
    f.player.play({ url: "https://bad/live.m3u8", mirrors: ["https://also-bad/live.m3u8"] });
    instances[0]!.handlers.get("error")!("error", { fatal: false, type: "network" });
    expect(instances).toHaveLength(1);
    instances[0]!.handlers.get("error")!("error", { fatal: true, type: "other" });
    instances[1]!.handlers.get("error")!("error", { fatal: true, type: "other" });
    expect(instances).toHaveLength(2);
    expect(f.fatal).toHaveBeenCalledOnce();
    f.player.retry();
    expect(instances[2]!.source).toBe("https://bad/live.m3u8");
  });
  it("switches between native and HLS sources and resets mirrors on channel change", () => {
    const f = fixture();
    f.player.play({ url: "https://bad/live.mp4", mirrors: ["https://good/live.m3u8"] });
    f.nativeError();
    expect(instances[0]!.source).toBe("https://good/live.m3u8");
    expect(f.toast).not.toHaveBeenCalled();
    f.player.play({ url: "https://other/live.mp4" });
    f.nativeError();
    expect(instances).toHaveLength(1);
    expect(f.fatal).toHaveBeenCalledOnce();
    f.player.stop();
    f.nativeError();
    expect(f.fatal).toHaveBeenCalledOnce();
  });
  it("skips unsupported DASH mirrors", () => {
    const f = fixture();
    expect(f.player.play({ url: "https://bad/live.mpd", mirrors: ["https://also-bad/live.mpd", "https://good/live.mp4"] })).toBeNull();
    expect(f.media.src).toBe("https://good/live.mp4");
    expect(f.toast).not.toHaveBeenCalled();
  });
  it("keeps the last playable source retryable when remaining mirrors are DASH", () => {
    const f = fixture();
    f.player.play({ url: "https://bad/live.m3u8", mirrors: ["https://bad/live.mpd"] });
    for (let i = 0; i < 4; i++) instances[0]!.handlers.get("error")!("error", { fatal: true, type: "network" });
    expect(f.player.currentStreamUrl).toBe("https://bad/live.m3u8");
    expect(f.fatal).toHaveBeenCalledOnce();
    expect(instances).toHaveLength(1);
    f.player.retry();
    expect(instances[1]!.source).toBe("https://bad/live.m3u8");
  });
});
