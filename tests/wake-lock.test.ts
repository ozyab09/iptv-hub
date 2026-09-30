import { describe, expect, it } from "vitest";
import {
  initialWakeLockState,
  wakeLockHidden,
  wakeLockPlay,
  wakeLockStop,
  wakeLockVisible,
  type WakeLockHooks,
} from "../src/wake-lock";

/** Фейковый Wake Lock API: считает запросы и release-ы. */
function makeHooks() {
  const stats = { requests: 0, releases: 0 };
  const hooks: WakeLockHooks = {
    request: () => {
      stats.requests++;
      return { release: () => stats.releases++ };
    },
  };
  return { hooks, stats };
}

describe("wake lock lifecycle", () => {
  it("play запрашивает замок, stop отпускает", () => {
    const { hooks, stats } = makeHooks();
    let s = wakeLockPlay(initialWakeLockState, hooks, true);
    expect(stats.requests).toBe(1);
    expect(s.active).not.toBeNull();

    s = wakeLockStop(s);
    expect(stats.releases).toBe(1);
    expect(s.active).toBeNull();
    expect(s.wanted).toBe(false);
  });

  it("повторный play не дублирует замок", () => {
    const { hooks, stats } = makeHooks();
    let s = wakeLockPlay(initialWakeLockState, hooks, true);
    s = wakeLockPlay(s, hooks, true);
    expect(stats.requests).toBe(1);
  });

  it("при скрытой вкладке замок не запрашивается, но wanted сохраняется", () => {
    const { hooks, stats } = makeHooks();
    const s = wakeLockPlay(initialWakeLockState, hooks, false);
    expect(stats.requests).toBe(0);
    expect(s.wanted).toBe(true);
  });

  it("hidden отпускает замок, visible перезапрашивает при живом playback", () => {
    const { hooks, stats } = makeHooks();
    let s = wakeLockPlay(initialWakeLockState, hooks, true);
    s = wakeLockHidden(s);
    expect(stats.releases).toBe(1);
    expect(s.wanted).toBe(true);

    s = wakeLockVisible(s, hooks);
    expect(stats.requests).toBe(2);
    expect(s.active).not.toBeNull();
  });

  it("visible после stop замок не возвращает", () => {
    const { hooks, stats } = makeHooks();
    const s = wakeLockStop(initialWakeLockState);
    const next = wakeLockVisible(s, hooks);
    expect(stats.requests).toBe(0);
    expect(next.active).toBeNull();
  });

  it("без hooks (API нет) — тихий no-op", () => {
    let s = wakeLockPlay(initialWakeLockState, {}, true);
    expect(s.active).toBeNull();
    s = wakeLockVisible(s, {});
    expect(s.active).toBeNull();
    s = wakeLockStop(s);
    expect(s.wanted).toBe(false);
  });
});
