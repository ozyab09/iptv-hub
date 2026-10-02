import { afterEach, describe, expect, it, vi } from "vitest";
import { Player } from "../src/player";
import { DEFAULT_PLAYER_SETTINGS } from "../src/player-settings";
import type { Channel } from "../src/types";

const configs = vi.hoisted(() => [] as unknown[]);
vi.mock("hls.js", () => ({
  default: class {
    static isSupported = () => true;
    static Events = {};
    latestLevelDetails = { live: true, edge: 240 };
    liveSyncPosition = 228;
    constructor(public config: { maxBufferLength: number }) { configs.push(config); }
    loadSource() {}
    attachMedia() {}
    on() {}
    destroy() {}
  },
}));
afterEach(() => { vi.unstubAllGlobals(); configs.length = 0; });

describe("снимок настроек запуска плеера", () => {
  it("пауза и перемотка сохраняют расширенный буфер до возврата к эфиру", () => {
    vi.stubGlobal("window", { location: { href: "https://app.test/" } });
    const listeners = new Map<string, () => void>();
    const video = {
      currentTime: 180, duration: Infinity, paused: true,
      buffered: { length: 1, start: () => 120, end: () => 240 },
      seekable: { length: 1, start: () => 120, end: () => 240 },
      addEventListener: (event: string, cb: () => void) => listeners.set(event, cb),
      removeAttribute: vi.fn(), load: vi.fn(), play: vi.fn(() => Promise.resolve()),
    };
    const player = new Player(video as unknown as HTMLVideoElement, vi.fn());
    player.play({ url: "https://stream.test/live.m3u8" });
    const config = configs[0] as { maxBufferLength: number };
    listeners.get("pause")!();
    expect(config.maxBufferLength).toBe(600);
    player.togglePause();
    expect(config.maxBufferLength).toBe(600);
    player.seekBy(-15);
    expect(video.currentTime).toBe(165);
    expect(player.liveEdge).toBe(240);
    player.goLive();
    expect(video.currentTime).toBeCloseTo(227.9);
    expect(config.maxBufferLength).toBe(30);
    player.play({ url: "https://stream.test/other.m3u8" });
    expect((configs[1] as { maxBufferLength: number }).maxBufferLength).toBe(30);
  });
  it("сохранение не меняет поток или retry, следующий канал берёт новые значения", () => {
    vi.stubGlobal("window", { location: { href: "https://app.test/" } });
    const video = {
      paused: false, addEventListener: vi.fn(), pause: vi.fn(),
      removeAttribute: vi.fn(), load: vi.fn(), play: vi.fn(() => Promise.resolve()),
    } as unknown as HTMLVideoElement;
    let pending = { ...DEFAULT_PLAYER_SETTINGS };
    const player = new Player(video, vi.fn(), undefined, undefined, () => pending);
    const channel: Channel = {
      name: "Тест", normalizedName: "тест", tvgId: null, logo: null, group: "",
      quality: null, catchupDays: 0, catchupSource: null, url: "https://stream.test/one.m3u8",
    };
    player.play(channel);
    pending.maxBufferLength = 300;
    pending.lowLatencyMode = true;
    pending.diagnosticsTimeoutMs = 20000;
    player.play(channel); // уже играет: это не новый запуск
    expect(configs).toHaveLength(1);
    expect(player.diagnosticsTimeoutMs).toBe(8000);
    player.retry();
    expect(configs[1]).toEqual({ enableWorker: true, maxBufferLength: 30, lowLatencyMode: false, backBufferLength: 600 });
    expect(player.diagnosticsTimeoutMs).toBe(8000);
    player.play({ ...channel, url: "https://stream.test/two.m3u8" });
    expect(configs[2]).toEqual({ enableWorker: true, maxBufferLength: 300, lowLatencyMode: true, backBufferLength: 600 });
    expect(player.diagnosticsTimeoutMs).toBe(20000);
  });
});
