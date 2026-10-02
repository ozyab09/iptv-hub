import { describe, it, expect } from "vitest";
import {
  behindLiveSeconds,
  clock,
  isBehindLive,
  LIVE_TOLERANCE_SEC,
  programmeProgress,
  mediaScrub,
} from "../src/scrub";

const t = (iso: string): number => Date.parse(iso);

describe("mediaScrub", () => {
  it("formats the file position and duration and computes progress", () => {
    expect(mediaScrub(65.9, 130.5, 300)).toEqual({ position: "01:05", duration: "02:10", progress: 65.9 / 130.5 });
    expect(mediaScrub(3601, 7200).position).toBe("60:01");
  });
  it.each([NaN, Infinity, 0, -1])("uses recording metadata when duration is %s", (duration) => {
    expect(mediaScrub(30, duration, 60)).toEqual({ position: "00:30", duration: "01:00", progress: 0.5 });
  });
  it("handles invalid metadata and clamps progress", () => {
    expect(mediaScrub(NaN, Infinity, NaN)).toEqual({ position: "00:00", duration: "00:00", progress: 0 });
    expect(mediaScrub(Infinity, 60).progress).toBe(0);
    expect(mediaScrub(-5, 60).progress).toBe(0);
    expect(mediaScrub(90, 60).progress).toBe(1);
    expect(mediaScrub(10, 0, -1).duration).toBe("00:00");
  });
});

describe("programmeProgress", () => {
  const start = t("2026-09-29T18:00:00Z");
  const stop = t("2026-09-29T19:00:00Z");

  it("считает долю прошедшего времени", () => {
    expect(programmeProgress(t("2026-09-29T18:00:00Z"), start, stop)).toBe(0);
    expect(programmeProgress(t("2026-09-29T18:30:00Z"), start, stop)).toBe(0.5);
    expect(programmeProgress(t("2026-09-29T19:00:00Z"), start, stop)).toBe(1);
  });

  it("прижимается к границам вне интервала", () => {
    // Программа могла устареть или опередить: полоса не должна уезжать
    // за пределы дорожки.
    expect(programmeProgress(t("2026-09-29T17:00:00Z"), start, stop)).toBe(0);
    expect(programmeProgress(t("2026-09-29T23:00:00Z"), start, stop)).toBe(1);
  });

  it("не делит на ноль на битой программе", () => {
    expect(programmeProgress(Date.now(), stop, start)).toBe(0); // конец раньше начала
    expect(programmeProgress(Date.now(), start, start)).toBe(0);
    expect(programmeProgress(Date.now(), NaN, stop)).toBe(0);
  });
});

describe("отставание от эфира", () => {
  it("считает разницу до края буфера", () => {
    expect(behindLiveSeconds(100, 160)).toBe(60);
  });

  it("обгон буфера — это ноль, а не отрицательное число", () => {
    expect(behindLiveSeconds(200, 160)).toBe(0);
  });

  it("пустой буфер не ломает расчёт", () => {
    expect(behindLiveSeconds(100, NaN)).toBe(0);
    expect(isBehindLive(100, NaN)).toBe(false);
  });

  it("в пределах допуска кнопку не показываем", () => {
    // HLS почти всегда держит край буфера на несколько секунд впереди —
    // без допуска «К эфиру» висела бы постоянно.
    expect(isBehindLive(100, 100 + LIVE_TOLERANCE_SEC - 1)).toBe(false);
    expect(isBehindLive(100, 100 + LIVE_TOLERANCE_SEC + 1)).toBe(true);
  });
});

describe("clock", () => {
  it("24-часовой формат", () => {
    expect(clock(t("2026-09-29T19:05:00"))).toBe("19:05");
    expect(clock(t("2026-09-29T00:30:00"))).toBe("00:30");
  });

  it("на мусоре отдаёт пустую строку, а не «Invalid Date»", () => {
    expect(clock(NaN)).toBe("");
  });
});
