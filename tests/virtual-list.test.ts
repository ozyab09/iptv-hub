import { describe, it, expect } from "vitest";
import {
  columnsForWidth,
  computeWindow,
  rowsForCount,
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
  it("is item count times row height in a single column", () => {
    expect(spacerHeight(2600)).toBe(2600 * 56);
    expect(spacerHeight(0)).toBe(0);
  });

  it("accounts for grid columns", () => {
    // 100 элементов в 2 колонки = 50 строк
    expect(spacerHeight(100, 56, 2)).toBe(50 * 56);
    // 101 элемент в 4 колонки = 26 строк (последняя неполная)
    expect(spacerHeight(101, 56, 4)).toBe(26 * 56);
    // 0 колонок не бывает — минимум 1
    expect(spacerHeight(10, 56, 0)).toBe(10 * 56);
  });
});

describe("columnsForWidth", () => {
  it("matches CSS auto-fill minmax(240px, 1fr)", () => {
    expect(columnsForWidth(239)).toBe(1);   // мобильный портрет
    expect(columnsForWidth(360)).toBe(1);   // мобильный портрет
    expect(columnsForWidth(480)).toBe(2);
    expect(columnsForWidth(1000)).toBe(4);
    expect(columnsForWidth(0)).toBe(1);     // защита от мусора
    expect(columnsForWidth(-5)).toBe(1);
  });

  it("respects custom min card width", () => {
    expect(columnsForWidth(300, 150)).toBe(2);
  });
});

describe("rowsForCount", () => {
  it("ceil-divides items by columns", () => {
    expect(rowsForCount(0, 3)).toBe(0);
    expect(rowsForCount(10, 1)).toBe(10);
    expect(rowsForCount(10, 2)).toBe(5);
    expect(rowsForCount(11, 2)).toBe(6);
    expect(rowsForCount(7, 3)).toBe(3);
    expect(rowsForCount(5, 0)).toBe(5);   // columns < 1 → 1 колонка
  });

  it("keeps computeWindow clamped to grid rows", () => {
    // 101 элемент в 4 колонки = 26 строк; окно не должно выйти за 26-ю строку
    const w = computeWindow(999_999, 600, 101, 56, 6, 4);
    expect(w.start + w.count).toBeLessThanOrEqual(26);
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
