import { describe, expect, it } from "vitest";
import { bufferedSeekTarget } from "../src/scrub";

describe("buffered timeshift seek", () => {
  const ranges = [{ start: 50, end: 100 }, { start: 120, end: 150 }];
  it("seeks within buffered media and clamps to real boundaries", () => {
    expect(bufferedSeekTarget(80, -15, ranges)).toBe(65);
    expect(bufferedSeekTarget(55, -15, ranges)).toBe(50);
    expect(bufferedSeekTarget(145, 15, ranges)).toBeCloseTo(149.9);
  });
  it("does not target gaps between buffered ranges", () => {
    expect(bufferedSeekTarget(95, 10, ranges)).toBeCloseTo(99.9);
    expect(bufferedSeekTarget(125, -10, ranges)).toBe(120);
  });
  it("ignores unavailable ranges and invalid inputs", () => {
    expect(bufferedSeekTarget(10, 15, [])).toBeNull();
    expect(bufferedSeekTarget(NaN, 15, ranges)).toBeNull();
    expect(bufferedSeekTarget(80, Infinity, ranges)).toBeNull();
    expect(bufferedSeekTarget(80, 15, [{ start: 100, end: 50 }])).toBeNull();
  });
});
