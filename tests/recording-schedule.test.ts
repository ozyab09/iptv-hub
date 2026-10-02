import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecordingScheduler, nextOccurrence, parseRecordingRules, type RecordingRule } from "../src/recording-schedule";

const rule = (patch: Partial<RecordingRule> = {}): RecordingRule => ({ id: "a", playlistId: "p", channelUrl: "https://tv/live.m3u8", channelName: "TV", group: "", title: "Show", start: 1000, stop: 5000, repeat: "once", revision: 1, lastStart: null, status: "scheduled", ...patch });
afterEach(() => vi.useRealTimers());
describe("recording schedule", () => {
  it("validates persisted rules", () => {
    expect(parseRecordingRules(JSON.stringify([rule(), rule({ channelUrl: "javascript:alert(1)" }), rule({ stop: 0 })]))).toEqual([rule()]);
    expect(parseRecordingRules("{")).toEqual([]);
  });
  it("starts and stops once with fake timers, without replay after reload", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    let rules = [rule()];
    const stop = vi.fn(async () => true);
    const start = vi.fn(async () => ({ stop, failed: () => false }));
    const deps = { now: Date.now, read: () => rules, write: (next: RecordingRule[]) => { rules = next; }, start, notify: vi.fn() };
    const scheduler = createRecordingScheduler(deps);
    const timer = setInterval(() => { void scheduler.tick(); }, 1000);
    await vi.advanceTimersByTimeAsync(1000); expect(start).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(4000); expect(stop).toHaveBeenCalledOnce();
    expect(rules[0]!.status).toBe("done");
    await createRecordingScheduler(deps).tick(); expect(start).toHaveBeenCalledOnce();
    clearInterval(timer);
  });
  it("deleting a running rule stops it; overlaps are missed", async () => {
    let rules = [rule(), rule({ id: "b" })];
    const stop = vi.fn(async () => true);
    const scheduler = createRecordingScheduler({ now: () => 2000, read: () => rules, write: (next) => { rules = next; }, start: async () => ({ stop, failed: () => false }), notify: vi.fn() });
    await scheduler.tick(); expect(rules[1]!.status).toBe("missed");
    rules = rules.filter((r) => r.id !== "a");
    await scheduler.tick(); expect(stop).toHaveBeenCalledOnce();
  });
  it("misses closed-tab slots and reports failed starts", async () => {
    let rules = [rule()];
    let now = 2000;
    const scheduler = createRecordingScheduler({ now: () => now, read: () => rules, write: (next) => { rules = next; }, start: async () => { throw new Error("offline"); }, notify: vi.fn() });
    await scheduler.tick(); expect(rules[0]!.status).toBe("failed");
    rules = [rule()]; now = 6000;
    await scheduler.tick(); expect(rules[0]!.status).toBe("missed");
  });
  it("editing an active slot saves it and waits for its new start", async () => {
    let rules = [rule()];
    let now = 2000;
    const stop = vi.fn(async () => true);
    const start = vi.fn(async () => ({ stop, failed: () => false }));
    const scheduler = createRecordingScheduler({ now: () => now, read: () => rules, write: (next) => { rules = next; }, start, notify: vi.fn() });
    await scheduler.tick();
    rules = [rule({ start: 3000, stop: 7000, revision: 2 })];
    await scheduler.tick(); expect(stop).toHaveBeenCalledOnce(); expect(start).toHaveBeenCalledOnce();
    expect(rules[0]!.status).toBe("scheduled");
    now = 3000;
    await scheduler.tick(); expect(start).toHaveBeenCalledTimes(2);
    await scheduler.dispose(); expect(stop).toHaveBeenCalledTimes(2);
  });
  it("stops failed jobs and pending starts on disposal", async () => {
    let rules = [rule()];
    const stop = vi.fn(async () => true);
    const deps = { now: () => 2000, read: () => rules, write: (next: RecordingRule[]) => { rules = next; }, notify: vi.fn() };
    const scheduler = createRecordingScheduler({ ...deps, start: async () => ({ stop, failed: () => true }) });
    await scheduler.tick(); await scheduler.tick();
    expect(stop).toHaveBeenCalledOnce(); expect(rules[0]!.status).toBe("failed");
    rules = [rule()];
    let resolve!: (job: { stop: typeof stop; failed(): boolean }) => void;
    const pending = createRecordingScheduler({ ...deps, start: () => new Promise((done) => { resolve = done; }) });
    const tick = pending.tick();
    await pending.dispose();
    resolve({ stop, failed: () => false });
    await tick; expect(stop).toHaveBeenCalledTimes(2);
  });
  it("repeats in local calendar time and skips weekends", () => {
    const start = new Date(2026, 9, 2, 12).getTime();
    const r = rule({ start, stop: start + 3600000, repeat: "weekdays" });
    const monday = nextOccurrence(r, new Date(2026, 9, 3, 15).getTime())!;
    expect(new Date(monday.start).getDay()).toBe(1);
    expect(new Date(monday.start).getHours()).toBe(12);
    expect(monday.stop - monday.start).toBe(3600000);
    expect(nextOccurrence({ ...r, repeat: "daily" }, start + 3600001)!.start).toBe(new Date(2026, 9, 3, 12).getTime());
    const late = new Date(2026, 9, 2, 23, 30).getTime();
    expect(nextOccurrence(rule({ start: late, stop: late + 3600000, repeat: "daily" }), late + 2400000)!.start).toBe(late);
  });
});
