import { describe, it, expect } from "vitest";
import { neighborIndex } from "../src/player";

describe("neighborIndex (prev/next channel)", () => {
  it("returns null for an empty list", () => {
    expect(neighborIndex(0, 0, 1)).toBeNull();
  });

  it("steps forward and wraps around", () => {
    expect(neighborIndex(0, 5, 1)).toBe(1);
    expect(neighborIndex(4, 5, 1)).toBe(0);
  });

  it("steps backward and wraps around", () => {
    expect(neighborIndex(2, 5, -1)).toBe(1);
    expect(neighborIndex(0, 5, -1)).toBe(4);
  });

  it("handles single-element list", () => {
    expect(neighborIndex(0, 1, 1)).toBe(0);
    expect(neighborIndex(0, 1, -1)).toBe(0);
  });
});
