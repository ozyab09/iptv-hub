import { expect, it } from "vitest";
import { timelineProgrammes, timelineWindow, TIMELINE_SLOT_MS } from "../src/timeline-guide";
import type { EpgProgramme } from "../src/types";

const start = Date.parse("2026-10-03T00:00:00Z");
const programme = (from: number, to: number): EpgProgramme => ({ start: new Date(start + from * TIMELINE_SLOT_MS).toISOString(), stop: new Date(start + to * TIMELINE_SLOT_MS).toISOString(), title: `${from}–${to}`, desc: null });

it("virtualizes both axes independently for 2600 channels and 48 half-hour slots", () => {
  const win = timelineWindow(2600, 48, 960, 6400, 960, 640);
  expect(win.rows).toEqual({ start: 98, count: 14, offset: 6272 });
  expect(win.columns).toEqual({ start: 8, count: 14, offset: 768 });
  expect(win.rows.count).toBeLessThan(20);
  expect(win.columns.count).toBeLessThan(20);
});

it("clamps overscroll and keeps empty axes empty", () => {
  expect(timelineWindow(3, 4, -100, -100, 200, 100).rows).toEqual({ start: 0, count: 3, offset: 0 });
  const end = timelineWindow(2600, 48, 100_000, 1_000_000, 960, 640);
  expect(end.rows.start + end.rows.count).toBe(2600);
  expect(end.columns.start + end.columns.count).toBe(48);
  expect(end.rows.count).toBeGreaterThan(0);
  expect(timelineWindow(0, 0, 0, 0, 960, 640)).toEqual({ rows: { start: 0, count: 0, offset: 0 }, columns: { start: 0, count: 0, offset: 0 } });
  expect(timelineWindow(100, 48, 0, 0, 0, 0).rows.count).toBe(0);
});

it("renders only overlapping programmes and preserves widths by duration", () => {
  const items = [programme(0, 1), programme(1, 2.5), programme(2.5, 4), programme(4, 5)];
  const cells = timelineProgrammes(items, start, start + 48 * TIMELINE_SLOT_MS, { start: 1, count: 3, offset: 96 });
  expect(cells).toEqual([
    { programme: items[1], left: 96, width: 144 },
    { programme: items[2], left: 240, width: 144 },
  ]);
  expect(items).toHaveLength(4);
});

it("clips programmes crossing day boundaries and excludes malformed/zero-length entries", () => {
  const before = programme(-2, 1);
  const after = programme(47, 50);
  const cells = timelineProgrammes([before, after, programme(2, 2), { ...programme(2, 3), start: "invalid" }], start, start + 48 * TIMELINE_SLOT_MS, { start: 0, count: 48, offset: 0 });
  expect(cells).toEqual([{ programme: before, left: 0, width: 96 }, { programme: after, left: 4512, width: 96 }]);
  expect(timelineProgrammes([before], start, start + 48 * TIMELINE_SLOT_MS, { start: 0, count: 0, offset: 0 })).toEqual([]);
});
