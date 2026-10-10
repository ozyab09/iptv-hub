import { describe, expect, it } from "vitest";
import {
  initialSleepState,
  sleepButtonVisible,
  sleepCancel,
  sleepLabel,
  sleepRemainderMin,
  sleepStart,
  sleepStartEpisode,
  sleepTick,
} from "../src/sleep-timer";

const NOW = 1_000_000_000;

describe("sleep timer", () => {
  it("старт на N минут: срабатывает по истечении", () => {
    let s = sleepStart(initialSleepState, 30, NOW);
    expect(s.mode.kind).toBe("duration");
    expect(sleepTick(s, NOW + 29 * 60_000).fired).toBe(false);
    s = sleepTick(s, NOW + 30 * 60_000);
    expect(s.fired).toBe(true);
  });

  it("после срабатывания остаётся в fired до отмены", () => {
    let s = sleepTick(sleepStart(initialSleepState, 30, NOW), NOW + 60 * 60_000);
    expect(s.fired).toBe(true);
    s = sleepTick(s, NOW + 120 * 60_000);
    expect(s.fired).toBe(true);
    s = sleepCancel(s);
    expect(s.mode.kind).toBe("off");
    expect(s.fired).toBe(false);
  });

  it("«в конце передачи»: конец в будущем и в прошлом", () => {
    let s = sleepStartEpisode(initialSleepState, NOW + 10 * 60_000, NOW);
    expect(sleepTick(s, NOW + 5 * 60_000).fired).toBe(false);
    expect(sleepTick(s, NOW + 11 * 60_000).fired).toBe(true);

    // передача уже должна была кончиться — сработает на первом тике
    s = sleepStartEpisode(initialSleepState, NOW - 1, NOW);
    expect(sleepTick(s, NOW).fired).toBe(true);
  });

  it("остаток минут: округление вверх", () => {
    const s = sleepStart(initialSleepState, 30, NOW);
    expect(sleepRemainderMin(s, NOW + 1)).toBe(30);
    expect(sleepRemainderMin(s, NOW + 29 * 60_000 + 1)).toBe(1);
    expect(sleepRemainderMin(s, NOW + 30 * 60_000)).toBe(0);
    expect(sleepRemainderMin(initialSleepState, NOW)).toBeNull();
  });

  it("метка бейджа: минуты и «в конце передачи»", () => {
    expect(sleepLabel(sleepStart(initialSleepState, 60, NOW), NOW)).toBe("60 мин");
    expect(
      sleepLabel(sleepStartEpisode(initialSleepState, NOW + 5, NOW), NOW),
    ).toBe("в конце передачи");
    expect(sleepLabel(initialSleepState, NOW)).toBeNull();
  });

  it("таймер переживает смену канала (состояние не сбрасывается)", () => {
    const s = sleepStart(initialSleepState, 30, NOW);
    expect(s.mode.kind).toBe("duration");
  });

  it("кнопка сна видна только во время записи эфира (#471)", () => {
    expect(sleepButtonVisible(false, true)).toBe(true);
    expect(sleepButtonVisible(false, false)).toBe(false);
    expect(sleepButtonVisible(true, false)).toBe(false);
    expect(sleepButtonVisible(true, true)).toBe(false);
  });
});
