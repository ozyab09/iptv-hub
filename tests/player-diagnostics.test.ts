import { describe, expect, it, vi } from "vitest";
import { handleHlsFatal, handleNativeFatal, type HlsFatalActions, type HlsRecoveryState, type NativeFatalActions } from "../src/player-diagnostics";
import { MAX_NETWORK_RETRIES } from "../src/player-recovery";
import { autoLevelCap } from "../src/player-media";
import { mobileQualityCap } from "../src/mobile-quality";

function hlsCtx(overrides: Partial<HlsFatalActions> = {}) {
  const ctx = {
    tr: (key: string) => key,
    toast: vi.fn(),
    fatal: vi.fn(),
    isRecording: () => false,
    tryNextMirror: () => false,
    httpsUpgraded: () => false,
    startLoad: vi.fn(),
    recoverMediaError: vi.fn(),
    ...overrides,
  };
  return ctx as typeof ctx & HlsFatalActions;
}

// #376: разбор фатальных ошибок вынесен из player.ts — поведение прежнее.
describe("handleHlsFatal", () => {
  it("сеть: переподключения до предела, затем фатальный UI с причиной", () => {
    const ctx = hlsCtx();
    const state: HlsRecoveryState = { networkRetries: 0, media: null };
    for (let i = 0; i < MAX_NETWORK_RETRIES; i++) handleHlsFatal({ kind: "network" }, state, ctx, 0);
    expect(ctx.startLoad).toHaveBeenCalledTimes(MAX_NETWORK_RETRIES);
    expect(ctx.fatal).not.toHaveBeenCalled();
    handleHlsFatal({ kind: "network" }, state, ctx, 0);
    expect(ctx.fatal).toHaveBeenCalledOnce();
    expect(ctx.toast).toHaveBeenLastCalledWith("player.unavailable");
  });

  it("после https-апгрейда сетевой отказ объясняется отсутствием TLS", () => {
    const ctx = hlsCtx({ httpsUpgraded: () => true });
    const state: HlsRecoveryState = { networkRetries: MAX_NETWORK_RETRIES, media: null };
    handleHlsFatal({ kind: "network" }, state, ctx, 0);
    expect(ctx.toast).toHaveBeenLastCalledWith("player.noTls");
  });

  it("декодер: два восстановления, третья ошибка подряд — фатально (#350)", () => {
    const ctx = hlsCtx();
    const state: HlsRecoveryState = { networkRetries: 0, media: null };
    handleHlsFatal({ kind: "media" }, state, ctx, 0);
    handleHlsFatal({ kind: "media" }, state, ctx, 1000);
    expect(ctx.recoverMediaError).toHaveBeenCalledTimes(2);
    handleHlsFatal({ kind: "media", details: "bufferAppendError" }, state, ctx, 2000);
    expect(ctx.fatal).toHaveBeenCalledOnce();
  });

  it("зеркало и запись перехватывают ошибку раньше восстановления", () => {
    const mirror = hlsCtx({ tryNextMirror: () => true });
    handleHlsFatal({ kind: "network" }, { networkRetries: 0, media: null }, mirror, 0);
    expect(mirror.startLoad).not.toHaveBeenCalled();
    expect(mirror.fatal).not.toHaveBeenCalled();
    const recording = hlsCtx({ isRecording: () => true });
    handleHlsFatal({ kind: "other" }, { networkRetries: 0, media: null }, recording, 0);
    expect(recording.toast).toHaveBeenCalledWith("error.recordPlayback");
    expect(recording.fatal).toHaveBeenCalledOnce();
  });
});

describe("handleNativeFatal", () => {
  function nativeCtx(overrides: Partial<NativeFatalActions> = {}) {
    const ctx = { tr: (key: string) => key, toast: vi.fn(), fatal: vi.fn(), isRecording: () => false, tryNextMirror: () => false, httpsTried: () => false, upgrade: vi.fn(), ...overrides };
    return ctx as typeof ctx & NativeFatalActions;
  }

  it("публичный http — одна попытка https, потом фатально", () => {
    const ctx = nativeCtx();
    handleNativeFatal("http://cdn.example/live.mp4", ctx, "https://app/");
    expect(ctx.upgrade).toHaveBeenCalledWith("https://cdn.example/live.mp4");
    const tried = nativeCtx({ httpsTried: () => true });
    handleNativeFatal("https://cdn.example/live.mp4", tried, "https://app/");
    expect(tried.toast).toHaveBeenCalledWith("player.httpsFailed");
    expect(tried.fatal).toHaveBeenCalledOnce();
  });

  it("приватный http на https-странице не апгрейдится и объясняется", () => {
    const ctx = nativeCtx();
    handleNativeFatal("http://192.168.1.5/live.mp4", ctx, "https://app/");
    expect(ctx.upgrade).not.toHaveBeenCalled();
    expect(ctx.toast).toHaveBeenCalledWith("player.privateHttp");
  });
});

describe("autoLevelCap", () => {
  const hls = { levels: [{ height: 1080 }, { height: 720 }, { height: 360 }] } as never;
  const settings = { limitMobileQuality: true, mobileMaxHeight: 720 as const };
  it("мобильная сеть ограничивает Auto; ручной выбор и записи — без ограничения", () => {
    const cellular = { type: "cellular" };
    const capped = autoLevelCap(hls, settings, cellular, false, "https://x/a.m3u8");
    expect(capped).toBe(mobileQualityCap((hls as { levels: { height: number }[] }).levels, 720));
    expect(capped).not.toBe(-1);
    expect(autoLevelCap(hls, settings, cellular, true, "https://x/a.m3u8")).toBe(-1);
    expect(autoLevelCap(hls, settings, cellular, false, "blob:https://x/1")).toBe(-1);
    expect(autoLevelCap(hls, settings, { type: "wifi" }, false, "https://x/a.m3u8")).toBe(-1);
  });
});
