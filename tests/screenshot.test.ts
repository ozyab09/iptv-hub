import { describe, expect, it } from "vitest";
import { describeShotFailure, screenshotFileName } from "../src/screenshot";

describe("screenshotFileName", () => {
  it("канал + дата/время", () => {
    expect(screenshotFileName("Кино HD", new Date("2026-09-30T12:34:56Z"))).toBe(
      "Кино-HD-2026-09-30-12-34-56.png",
    );
  });

  it("опасные символы схлопываются в дефис", () => {
    expect(screenshotFileName("A/B: <тест>?", new Date("2026-09-30T00:00:00Z"))).toBe(
      "A-B-тест-2026-09-30-00-00-00.png",
    );
  });

  it("пустое имя — frame", () => {
    expect(screenshotFileName("///", new Date("2026-09-30T00:00:00Z"))).toBe(
      "frame-2026-09-30-00-00-00.png",
    );
  });
});

describe("describeShotFailure", () => {
  it("tainted — честное сообщение про CORS", () => {
    expect(describeShotFailure("tainted")).toMatch(/CORS/);
  });
  it("empty — «кадр ещё не готов»", () => {
    expect(describeShotFailure("empty")).toMatch(/не готов/);
  });
});
