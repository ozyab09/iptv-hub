import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebounced } from "../src/debounce";

describe("createDebounced (#357)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const timers = {
    set: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clear: (id: number) => clearTimeout(id),
  };

  it("семь быстрых нажатий — один вызов после паузы", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200, timers);
    for (let i = 0; i < 7; i++) {
      d.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush выполняет ожидающий вызов сразу и только один раз", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200, timers);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
    d.schedule();
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel отменяет вызов", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200, timers);
    d.schedule();
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});
