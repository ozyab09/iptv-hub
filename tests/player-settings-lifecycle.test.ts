import { afterEach, describe, expect, it, vi } from "vitest";
import { Player } from "../src/player";
import { DEFAULT_PLAYER_SETTINGS } from "../src/player-settings";
import type { Channel } from "../src/types";

const configs = vi.hoisted(() => [] as unknown[]);
vi.mock("hls.js", () => ({
  default: class {
    static isSupported = () => true;
    static Events = {};
    constructor(config: unknown) { configs.push(config); }
    loadSource() {}
    attachMedia() {}
    on() {}
    destroy() {}
  },
}));
afterEach(() => { vi.unstubAllGlobals(); configs.length = 0; });

describe("снимок настроек запуска плеера", () => {
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
    expect(configs[1]).toEqual({ enableWorker: true, maxBufferLength: 30, lowLatencyMode: false });
    expect(player.diagnosticsTimeoutMs).toBe(8000);
    player.play({ ...channel, url: "https://stream.test/two.m3u8" });
    expect(configs[2]).toEqual({ enableWorker: true, maxBufferLength: 300, lowLatencyMode: true });
    expect(player.diagnosticsTimeoutMs).toBe(20000);
  });
});
