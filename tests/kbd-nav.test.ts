import { describe, expect, it } from "vitest";
import { firstFocus, lastFocus, moveFocus, trapFocus } from "../src/kbd-nav";

describe("moveFocus", () => {
  it("шагает вниз/вверх", () => {
    expect(moveFocus(5, 2, 1)).toBe(3);
    expect(moveFocus(5, 2, -1)).toBe(1);
  });

  it("на краях останавливается (null)", () => {
    expect(moveFocus(5, 4, 1)).toBeNull();
    expect(moveFocus(5, 0, -1)).toBeNull();
  });

  it("пустой список — null", () => {
    expect(moveFocus(0, 0, 1)).toBeNull();
  });
});

describe("firstFocus / lastFocus", () => {
  it("первый и последний", () => {
    expect(firstFocus(5)).toBe(0);
    expect(lastFocus(5)).toBe(4);
    expect(firstFocus(0)).toBeNull();
    expect(lastFocus(0)).toBeNull();
  });
});

describe("trapFocus", () => {
  it("Tab зацикливается внутри ловушки", () => {
    expect(trapFocus(3, 0, false)).toBe(1);
    expect(trapFocus(3, 2, false)).toBe(0);
  });

  it("Shift+Tab — назад", () => {
    expect(trapFocus(3, 0, true)).toBe(2);
    expect(trapFocus(3, 2, true)).toBe(1);
  });

  it("пустая ловушка безопасна", () => {
    expect(trapFocus(0, 0, false)).toBe(0);
  });
});
