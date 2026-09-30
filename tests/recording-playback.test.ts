import { afterEach, describe, expect, it, vi } from "vitest";
import { recordingManifest } from "../src/recording-playback";
import { Player } from "../src/player";

const state = vi.hoisted(() => ({ supported: true, sources: [] as string[] }));
vi.mock("hls.js", () => ({
  default: class {
    static isSupported = () => state.supported;
    static Events = {};
    loadSource(url: string) { state.sources.push(url); }
    attachMedia() {}
    on() {}
    destroy() {}
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  state.supported = true;
  state.sources = [];
});

function setup(nativeTs = "") {
  vi.stubGlobal("window", { location: { href: "https://app.test/" } });
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return `blob:https://app.test/${blobs.length}`;
  });
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const listeners: Record<string, () => void> = {};
  const video = {
    paused: true, src: "", canPlayType: () => nativeTs,
    addEventListener: (name: string, cb: () => void) => { listeners[name] = cb; },
    removeAttribute: vi.fn(), load: vi.fn(), play: vi.fn(() => Promise.resolve()),
  } as unknown as HTMLVideoElement;
  const toast = vi.fn();
  const player = new Player(video, toast);
  return { player, video, toast, blobs, revoke, listeners };
}

describe("воспроизведение записей", () => {
  it("конечный манифест с ненулевой длительностью", () => {
    const manifest = recordingManifest("blob:https://app.test/file", 4.2);
    expect(manifest).toContain("#EXT-X-TARGETDURATION:5\n");
    expect(manifest).toContain("#EXTINF:4.2,\nblob:https://app.test/file\n");
    expect(manifest).toContain("#EXT-X-ENDLIST");
    for (const value of [0, -1, NaN, Infinity]) {
      expect(recordingManifest("blob:test", value)).toContain("#EXTINF:1,");
    }
  });
  it("TS идёт через hls.js, URL живут до закрытия и переживают retry", async () => {
    const { player, blobs, revoke } = setup();
    expect(player.playRecording(new Blob(["ts"]), "ts", 4)).toBeNull();
    expect(state.sources).toEqual(["blob:https://app.test/2"]);
    expect(await blobs[1]!.text()).toBe(recordingManifest("blob:https://app.test/1", 4));
    player.retry();
    expect(state.sources).toHaveLength(2);
    expect(state.sources[1]).toBe(state.sources[0]);
    expect(revoke).not.toHaveBeenCalled();
    player.stop();
    expect(revoke.mock.calls).toEqual([["blob:https://app.test/1"], ["blob:https://app.test/2"]]);
    player.stop();
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it.each(["mp4", "webm"])("%s остаётся нативным и освобождается при смене канала", (ext) => {
    const { player, video, blobs, revoke } = setup();
    player.playRecording(new Blob(["media"]), ext, 4);
    expect(video.src).toBe("blob:https://app.test/1");
    expect(blobs[0]!.type).toBe(`video/${ext}`);
    expect(state.sources).toEqual([]);
    player.play({ url: "https://app.test/channel.mp4" });
    expect(revoke).toHaveBeenCalledWith("blob:https://app.test/1");
  });
  it("отказывает без MSE/нативного TS до создания URL", () => {
    state.supported = false;
    const { player, blobs } = setup();
    expect(player.playRecording(new Blob(), "ts", 4)).toContain("TS-записей");
    expect(blobs).toHaveLength(0);
  });
  it("нативный TS используется, если браузер его поддерживает", () => {
    state.supported = false;
    const { player, video, blobs } = setup("maybe");
    expect(player.playRecording(new Blob(), "ts", 4)).toBeNull();
    expect(video.src).toBe("blob:https://app.test/1");
    expect(blobs[0]!.type).toBe("video/mp2t");
  });
  it("ошибка локального файла не запускает https-апгрейд", () => {
    const { player, toast, listeners } = setup();
    player.playRecording(new Blob(), "mp4", 4);
    listeners.error!();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("внешнем плеере"));
    expect(player.currentStreamUrl).toBe("blob:https://app.test/1");
  });
});
