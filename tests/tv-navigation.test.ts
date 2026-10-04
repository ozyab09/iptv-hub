import { expect, it } from "vitest";
import { tvFocusTarget } from "../src/tv-navigation";
const rect = (left: number, top: number) => ({ left, top, width: 40, height: 40 });
it("chooses nearby controls in each direction, favoring alignment", () => {
  const candidates = [rect(0, 50), rect(100, 50), rect(50, 0), rect(50, 100), rect(90, 200)];
  expect(tvFocusTarget(rect(50, 50), candidates, "ArrowLeft")).toBe(0);
  expect(tvFocusTarget(rect(50, 50), candidates, "ArrowRight")).toBe(1);
  expect(tvFocusTarget(rect(50, 50), candidates, "ArrowUp")).toBe(2);
  expect(tvFocusTarget(rect(50, 50), candidates, "ArrowDown")).toBe(3);
});
it("does not wrap at boundaries and preserves candidate order on ties", () => {
  expect(tvFocusTarget(rect(0, 0), [], "ArrowRight")).toBeNull();
  expect(tvFocusTarget(rect(0, 0), [rect(0, 50)], "ArrowLeft")).toBeNull();
  expect(tvFocusTarget(rect(0, 0), [rect(50, 0), rect(50, 0)], "ArrowRight")).toBe(0);
});
