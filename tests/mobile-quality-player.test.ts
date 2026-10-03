import { afterEach, expect, it, vi } from "vitest";
import { Player } from "../src/player";
import { DEFAULT_PLAYER_SETTINGS } from "../src/player-settings";

const instances = vi.hoisted(() => [] as Array<{
  autoLevelCapping: number; currentLevel: number;
  handlers: Map<string, () => void>;
}>);
vi.mock("hls.js", () => ({ default: class {
  static isSupported = () => true;
  static Events = { MANIFEST_PARSED: "manifest" };
  levels = [{ height: 360 }, { height: 720 }, { height: 1080 }];
  autoLevelCapping = -1;
  currentLevel = -1;
  handlers = new Map<string, () => void>();
  constructor() { instances.push(this); }
  on(event: string, handler: () => void) { this.handlers.set(event, handler); }
  loadSource() {}
  attachMedia() {}
  destroy() {}
} }));

afterEach(() => { vi.unstubAllGlobals(); instances.length = 0; });

it("caps Auto on cellular, removes cap on Wi-Fi and preserves manual selection", () => {
  const connection = Object.assign(new EventTarget(), { type: "cellular", effectiveType: "4g" });
  vi.stubGlobal("navigator", { connection });
  vi.stubGlobal("window", { location: { href: "https://app.test/" } });
  const media = { paused: true, addEventListener: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(), play: vi.fn(() => Promise.resolve()) };
  const settings = { ...DEFAULT_PLAYER_SETTINGS, limitMobileQuality: true };
  const player = new Player(media as unknown as HTMLVideoElement, vi.fn(), undefined, undefined, () => settings);
  player.play({ url: "https://stream.test/live.m3u8" });
  const hls = instances[0]!;
  hls.handlers.get("manifest")!();
  expect(hls.autoLevelCapping).toBe(1);
  connection.type = "wifi";
  connection.dispatchEvent(new Event("change"));
  expect(hls.autoLevelCapping).toBe(-1);
  connection.type = "cellular";
  connection.dispatchEvent(new Event("change"));
  expect(hls.autoLevelCapping).toBe(1);
  player.setLevel(2);
  expect(hls.autoLevelCapping).toBe(-1);
  connection.dispatchEvent(new Event("change"));
  expect(hls.currentLevel).toBe(2);
  expect(hls.autoLevelCapping).toBe(-1);
  player.setLevel(-1);
  expect(hls.autoLevelCapping).toBe(1);
  const remove = vi.spyOn(connection, "removeEventListener");
  player.stop();
  expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
});

it("retry keeps settings and stale manifests cannot update the new stream", () => {
  const connection = Object.assign(new EventTarget(), { effectiveType: "3g" });
  vi.stubGlobal("navigator", { connection });
  vi.stubGlobal("window", { location: { href: "https://app.test/" } });
  const media = { paused: true, addEventListener: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(), play: vi.fn(() => Promise.resolve()) };
  const settings = { ...DEFAULT_PLAYER_SETTINGS, limitMobileQuality: true, mobileMaxHeight: 480 };
  const player = new Player(media as unknown as HTMLVideoElement, vi.fn(), undefined, undefined, () => settings);
  player.play({ url: "https://stream.test/live.m3u8" });
  settings.limitMobileQuality = false;
  player.retry();
  instances[0]!.handlers.get("manifest")!();
  expect(instances[1]!.autoLevelCapping).toBe(-1);
  instances[1]!.handlers.get("manifest")!();
  expect(instances[1]!.autoLevelCapping).toBe(0);
  player.play({ url: "https://stream.test/other.m3u8" });
  instances[2]!.handlers.get("manifest")!();
  expect(instances[2]!.autoLevelCapping).toBe(-1);
  player.stop();
});
