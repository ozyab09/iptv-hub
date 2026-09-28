import { describe, it, expect } from "vitest";
import {
  formatBitrate,
  formatResolution,
  levelLabel,
  sortLevelsDesc,
  trackLabel,
  formatStatus,
} from "../src/quality";

describe("formatBitrate", () => {
  it("formats kbps below 1 Mbps", () => {
    expect(formatBitrate(850_000)).toBe("850 кбит/с");
  });
  it("formats Mbps above 1 Mbps", () => {
    expect(formatBitrate(4_500_000)).toBe("4.5 Мбит/с");
  });
  it("handles zero/invalid", () => {
    expect(formatBitrate(0)).toBe("—");
    expect(formatBitrate(NaN)).toBe("—");
  });
});

describe("formatResolution", () => {
  it("joins width and height", () => {
    expect(formatResolution(1920, 1080)).toBe("1920×1080");
  });
  it("returns dash when unknown", () => {
    expect(formatResolution(0, 1080)).toBe("—");
    expect(formatResolution(undefined, undefined)).toBe("—");
  });
});

describe("levelLabel", () => {
  it("includes height and bitrate", () => {
    expect(levelLabel({ height: 1080, bitrate: 4_500_000 })).toBe(
      "1080p (4.5 Мбит/с)",
    );
  });
  it("falls back without height", () => {
    expect(levelLabel({ height: 0, bitrate: 0 })).toBe("уровень");
  });
});

describe("sortLevelsDesc", () => {
  it("sorts by height desc without mutating input", () => {
    const input = [
      { height: 720, bitrate: 2_000_000 },
      { height: 1080, bitrate: 4_000_000 },
      { height: 360, bitrate: 800_000 },
    ];
    const out = sortLevelsDesc(input);
    expect(out.map((l) => l.height)).toEqual([1080, 720, 360]);
    expect(input[0]!.height).toBe(720);
  });
});

describe("trackLabel", () => {
  it("prefers name with lang suffix", () => {
    expect(trackLabel({ name: "Ru", lang: "rus" }, 0)).toBe("Ru [rus]");
  });
  it("falls back to lang then index", () => {
    expect(trackLabel({ lang: "eng" }, 1)).toBe("eng");
    expect(trackLabel({}, 2)).toBe("Дорожка 3");
  });
});

describe("formatStatus", () => {
  it("joins resolution and bitrate", () => {
    expect(formatStatus({ resolution: "1920×1080", bitrate: "4.5 Мбит/с" })).toBe(
      "1920×1080 · 4.5 Мбит/с",
    );
  });
});
