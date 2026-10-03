import { expect, it, vi } from "vitest";
import { createReminderScheduler, parseReminders, parseReminderSettings, remindersKey, toggleReminder, type ProgrammeReminder } from "../src/reminder";

const start = Date.parse("2026-10-03T21:00:00Z");
const reminder = (patch: Partial<ProgrammeReminder> = {}): ProgrammeReminder => ({ channelUrl: "https://tv.test/a.m3u8", channelName: "Alpha", title: "Film", start, stop: start + 3_600_000, leadMinutes: 5, notified: false, ...patch });

it("defaults settings and validates the supported lead-time range", () => {
  for (const raw of [null, "broken", '{"minutes":0}', '{"minutes":61}', '{"minutes":1.5}']) expect(parseReminderSettings(raw)).toEqual({ minutes: 5, desktop: false });
  expect(parseReminderSettings('{"minutes":10,"desktop":true}')).toEqual({ minutes: 10, desktop: true });
});

it("parses saved reminders, deduplicates channel/start and defaults invalid lead times", () => {
  const a = reminder({ leadMinutes: 0 });
  expect(parseReminders(JSON.stringify([a, a, null, { ...a, stop: start }, { ...a, start: "invalid" }]))).toEqual([reminder()]);
  expect(parseReminders("broken")).toEqual([]);
  expect(parseReminders("{}")).toEqual([]);
  expect(parseReminders(null)).toEqual([]);
  expect(parseReminders(JSON.stringify([reminder({ notified: true, leadMinutes: 60 })]))).toEqual([reminder({ notified: true, leadMinutes: 60 })]);
});

it("second click removes the reminder and keeps other channels/programmes", () => {
  const other = reminder({ channelUrl: "https://tv.test/b.m3u8" });
  const list = [other];
  const added = toggleReminder(list, reminder(), start - 600_000);
  expect(added).toEqual([other, reminder()]);
  expect(list).toEqual([other]);
  expect(toggleReminder(added, reminder(), start - 500_000)).toEqual([other]);
  expect(toggleReminder([], reminder(), start)).toEqual([]);
});

it("notifies exactly at the default five-minute boundary and persists before delivery", () => {
  let now = start - 300_001;
  let list = [reminder()];
  const write = vi.fn((value: ProgrammeReminder[]) => { list = value; });
  const notify = vi.fn(() => expect(list[0]!.notified).toBe(true));
  const scheduler = createReminderScheduler({ now: () => now, read: () => list, write, notify });
  scheduler.tick();
  expect(write).not.toHaveBeenCalled();
  now++;
  scheduler.tick();
  scheduler.tick();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(1);
  const reloaded = createReminderScheduler({ now: () => now, read: () => parseReminders(JSON.stringify(list)), write, notify });
  reloaded.tick();
  expect(notify).toHaveBeenCalledTimes(1);
});

it("supports different lead times and cleans expired starts without late notification", () => {
  let now = start - 600_000;
  let list = [reminder({ leadMinutes: 10 }), reminder({ channelUrl: "https://tv.test/b.m3u8", leadMinutes: 1 })];
  const notify = vi.fn();
  const scheduler = createReminderScheduler({ now: () => now, read: () => list, write: (value) => { list = value; }, notify });
  scheduler.tick();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify.mock.calls[0]![0].leadMinutes).toBe(10);
  now = start + 1;
  scheduler.tick();
  expect(list).toEqual([]);
  expect(notify).toHaveBeenCalledTimes(1);
});

it("keeps playlist storage and delivery isolated", () => {
  const storage = new Map([[remindersKey("one"), JSON.stringify([reminder()])], [remindersKey("two"), JSON.stringify([reminder({ title: "Other film" })])]]);
  const notify = vi.fn();
  const scheduler = createReminderScheduler({
    now: () => start - 120_000,
    read: () => parseReminders(storage.get(remindersKey("one"))!),
    write: (value) => { storage.set(remindersKey("one"), JSON.stringify(value)); }, notify,
  });
  scheduler.tick();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(parseReminders(storage.get(remindersKey("two"))!)[0]!.notified).toBe(false);
});
