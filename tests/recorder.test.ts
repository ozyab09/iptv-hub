import { describe, it, expect } from "vitest";
import {
  recordingFileName,
  validateRecOp,
  pickRecorderMime,
} from "../src/recorder";

describe("recordingFileName", () => {
  it("builds Channel_YYYY-MM-DD_HH-MM.webm", () => {
    const at = new Date(2026, 8, 28, 15, 7); // локальное время
    expect(recordingFileName("CNN HD", at)).toBe("CNN_HD_2026-09-28_15-07.webm");
  });
  it("sanitizes filesystem-unsafe characters", () => {
    const at = new Date(2026, 0, 2, 3, 4);
    expect(recordingFileName('Кино/ТВ: "4K"', at)).toBe(
      "Кино_ТВ_4K_2026-01-02_03-04.webm",
    );
  });
  it("falls back to 'recording' for an empty name", () => {
    expect(recordingFileName("", new Date(2026, 0, 1))).toBe(
      "recording_2026-01-01_00-00.webm",
    );
  });
});

describe("validateRecOp", () => {
  it("rejects double start", () => {
    expect(validateRecOp("recording", "start")).toBe("Запись уже идёт");
  });
  it("rejects stop when idle", () => {
    expect(validateRecOp("idle", "stop")).toBe("Запись не запущена");
  });
  it("allows valid transitions", () => {
    expect(validateRecOp("idle", "start")).toBeNull();
    expect(validateRecOp("recording", "stop")).toBeNull();
  });
});

describe("pickRecorderMime", () => {
  it("returns a string or null without throwing in node", () => {
    // в node MediaRecorder нет — должен вернуть null, а не упасть
    expect([null, expect.any(String)]).toContainEqual(pickRecorderMime());
  });
});
