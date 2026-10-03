import { describe, it, expect } from "vitest";
import {
  parseCatchup,
  buildCatchupUrl,
  canWatchPast,
  programmeStartUrl,
  hourlyFallbackProgrammes,
  dayWindows,
  programmesInDay,
  MAX_CATCHUP_DAYS,
} from "../src/catchup";
import type { EpgProgramme } from "../src/types";

const prog: EpgProgramme = {
  start: "2026-09-28T10:00:00.000Z",
  stop: "2026-09-28T11:00:00.000Z",
  title: "News",
  desc: null,
};

describe("parseCatchup", () => {
  it("reads tvg-rec days", () => {
    expect(parseCatchup("3", null, null, null)).toEqual({
      days: 3,
      source: null,
    });
  });
  it("prefers the larger of tvg-rec/catchup-days", () => {
    expect(parseCatchup("1", "7", null, null).days).toBe(3); // capped by MAX
  });
  it("treats catchup flag as 1 day", () => {
    expect(parseCatchup(null, null, "default", null).days).toBe(1);
    expect(parseCatchup(null, null, "0", null).days).toBe(0);
  });
  it("caps depth at MAX_CATCHUP_DAYS", () => {
    expect(MAX_CATCHUP_DAYS).toBe(3);
    expect(parseCatchup("30", null, null, null).days).toBe(3);
  });
  it("keeps the source template", () => {
    expect(parseCatchup("1", null, null, "http://x/{utc}.ts").source).toBe(
      "http://x/{utc}.ts",
    );
  });
});

describe("buildCatchupUrl", () => {
  const info = {
    days: 3,
    source: "http://x/stream?utc={utc}&lutc={lutc}&d={duration}&o={offset}",
  };
  const now = new Date("2026-09-28T12:00:00.000Z");
  it("substitutes known placeholders", () => {
    expect(buildCatchupUrl(info, prog, now)).toBe(
      "http://x/stream?utc=1790589600&lutc=1790596800&d=3600&o=7200",
    );
  });
  it("returns null without a template", () => {
    expect(buildCatchupUrl({ days: 3, source: null }, prog, now)).toBeNull();
  });
});

describe("canWatchPast", () => {
  const now = new Date("2026-09-28T12:00:00.000Z");
  it("allows programmes within the archive depth", () => {
    const yesterday = {
      ...prog,
      start: "2026-09-27T10:00:00.000Z",
      stop: "2026-09-27T11:00:00.000Z",
    };
    expect(canWatchPast({ days: 3, source: "x" }, yesterday, now)).toBe(true);
  });
  it("rejects programmes older than the depth", () => {
    const old = {
      ...prog,
      start: "2026-09-20T10:00:00.000Z",
      stop: "2026-09-20T11:00:00.000Z",
    };
    expect(canWatchPast({ days: 3, source: "x" }, old, now)).toBe(false);
  });
  it("rejects without archive", () => {
    expect(canWatchPast({ days: 0, source: null }, prog, now)).toBe(false);
  });
});

describe("programmeStartUrl", () => {
  const info = { days: 3, source: "https://x/archive.m3u8?utc={utc}&lutc={lutc}" };
  it("uses the programme start, not the current live position", () => {
    expect(programmeStartUrl(info, prog, new Date("2026-09-28T10:30:00Z"))).toBe("https://x/archive.m3u8?utc=1790589600&lutc=1790591400");
  });
  it("hides during the first second, before and after the programme", () => {
    for (const now of ["2026-09-28T09:59:59Z", "2026-09-28T10:00:00.999Z", "2026-09-28T11:00:00Z"]) {
      expect(programmeStartUrl(info, prog, new Date(now))).toBeNull();
    }
    expect(programmeStartUrl(info, prog, new Date("2026-09-28T10:00:01Z"))).not.toBeNull();
  });
  it("requires EPG, archive depth and a URL template", () => {
    const now = new Date("2026-09-28T10:30:00Z");
    expect(programmeStartUrl(info, null, now)).toBeNull();
    expect(programmeStartUrl({ ...info, days: 0 }, prog, now)).toBeNull();
    expect(programmeStartUrl({ ...info, source: null }, prog, now)).toBeNull();
  });
  it("rejects invalid programme dates and a start outside archive depth", () => {
    const now = new Date("2026-09-28T10:30:00Z");
    expect(programmeStartUrl(info, { ...prog, start: "invalid" }, now)).toBeNull();
    expect(programmeStartUrl(info, { ...prog, stop: "invalid" }, now)).toBeNull();
    expect(programmeStartUrl(info, { ...prog, start: "2026-09-20T10:00:00Z" }, now)).toBeNull();
  });
});

describe("dayWindows", () => {
  it("creates today + 3 previous days", () => {
    const wins = dayWindows(new Date("2026-09-28T15:00:00.000Z"));
    expect(wins).toHaveLength(4);
    expect(wins[0]!.label).toBe("Сегодня");
    expect(wins[1]!.label).toBe("Вчера");
    expect(wins[2]!.label).toContain("26.09");
  });
  it("windows are consecutive 24h spans", () => {
    const wins = dayWindows(new Date("2026-09-28T15:00:00.000Z"));
    expect(wins[0]!.endMs - wins[0]!.startMs).toBe(86_400_000);
    expect(wins[1]!.endMs).toBe(wins[0]!.startMs);
  });
});

describe("programmesInDay", () => {
  const wins = dayWindows(new Date("2026-09-28T15:00:00.000Z"));
  it("keeps programmes intersecting the day window, sorted", () => {
    const a: EpgProgramme = { ...prog, start: "2026-09-28T09:00:00.000Z", stop: "2026-09-28T09:30:00.000Z" };
    const b: EpgProgramme = { ...prog, start: "2026-09-28T12:00:00.000Z", stop: "2026-09-28T13:00:00.000Z" };
    const yesterday: EpgProgramme = { ...prog, start: "2026-09-27T09:00:00.000Z", stop: "2026-09-27T09:30:00.000Z" };
    const out = programmesInDay([b, yesterday, a], wins[0]!);
    expect(out.map((p) => p.start)).toEqual([a.start, b.start]);
  });
});

describe("hourlyFallbackProgrammes", () => {
  const now = new Date("2026-09-28T15:30:00.000Z");

  it("создаёт 168 часовых слотов на неделю назад", () => {
    expect(hourlyFallbackProgrammes(now)).toHaveLength(7 * 24);
  });

  it("последний слот — текущий час (его конец на границе часа), остальные раньше", () => {
    const out = hourlyFallbackProgrammes(now);
    const last = out[out.length - 1]!;
    expect(last.stop).toBe("2026-09-28T15:00:00.000Z");
    expect(last.start).toBe("2026-09-28T14:00:00.000Z");
    for (const p of out) expect(Date.parse(p.stop)).toBeLessThanOrEqual(now.getTime());
  });

  it("слоты идут от старых к новым и стыкуются без наложений", () => {
    const out = hourlyFallbackProgrammes(now);
    for (let i = 1; i < out.length; i++) {
      expect(Date.parse(out[i]!.start) - Date.parse(out[i - 1]!.start)).toBe(3_600_000);
      expect(out[i]!.start).toBe(out[i - 1]!.stop);
    }
  });

  it("название и пустое описание — как у передач без EPG", () => {
    const out = hourlyFallbackProgrammes(now);
    expect(out[0]!.title).toBe("Без названия");
    expect(out[0]!.desc).toBeNull();
  });

  it("горизонт настраивается (3 дня для MAX_CATCHUP_DAYS)", () => {
    expect(hourlyFallbackProgrammes(now, 3)).toHaveLength(3 * 24);
  });
});
