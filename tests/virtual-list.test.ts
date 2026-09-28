import { describe, it, expect } from "vitest";
import {
  computeWindow,
  spacerHeight,
  indexForOffset,
  DEFAULT_ROW_HEIGHT,
} from "../src/virtual-list";

describe("computeWindow", () => {
  it("renders an initial window at scrollTop 0", () => {
    const w = computeWindow(0, 600, 2600);
    expect(w.start).toBe(0);
    expect(w.count).toBeGreaterThan(10);
    expect(w.offset).toBe(0);
  });

  it("slides with scrollTop and keeps count stable", () => {
    const w = computeWindow(5000, 600, 2600);
    expect(w.start).toBe(Math.floor(5000 / 56) - 6);
    expect(w.count).toBe(Math.ceil(600 / 56) + 12);
  });

  it("clamps at the end of the list", () => {
    const w = computeWindow(999_999, 600, 100);
    expect(w.start).toBeGreaterThanOrEqual(0);
    expect(w.start + w.count).toBeLessThanOrEqual(100);
  });

  it("handles empty list", () => {
    expect(computeWindow(0, 600, 0)).toEqual({ start: 0, count: 0, offset: 0 });
  });

  it("respects custom row height", () => {
    const w = computeWindow(1000, 400, 5000, 100, 2);
    expect(w.start).toBe(8);
    expect(w.offset).toBe(800);
  });

  it("defaults are importable", () => {
    expect(DEFAULT_ROW_HEIGHT).toBe(56);
  });
});

describe("spacerHeight", () => {
  it("is item count times row height", () => {
    expect(spacerHeight(2600)).toBe(2600 * 56);
    expect(spacerHeight(0)).toBe(0);
  });
});

describe("indexForOffset", () => {
  it("maps Y to row index", () => {
    expect(indexForOffset(0)).toBe(0);
    expect(indexForOffset(55)).toBe(0);
    expect(indexForOffset(56)).toBe(1);
    expect(indexForOffset(-5)).toBe(0);
  });
});
