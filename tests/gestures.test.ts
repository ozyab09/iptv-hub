import { describe, it, expect } from "vitest";
import {
  classifySwipe,
  DOUBLE_TAP_MS,
  isDoubleTap,
  SWIPE_MIN_PX,
  tapSide,
} from "../src/gestures";

describe("classifySwipe", () => {
  it("узнаёт четыре направления", () => {
    expect(classifySwipe(0, -80)).toBe("up");
    expect(classifySwipe(0, 80)).toBe("down");
    expect(classifySwipe(-80, 0)).toBe("left");
    expect(classifySwipe(80, 0)).toBe("right");
  });

  it("короткое движение свайпом не считается", () => {
    // Иначе любое дрожание пальца по кадру переключало бы канал.
    expect(classifySwipe(0, SWIPE_MIN_PX - 1)).toBeNull();
    expect(classifySwipe(SWIPE_MIN_PX - 1, 0)).toBeNull();
    expect(classifySwipe(0, 0)).toBeNull();
  });

  it("на диагонали выбирает одну ось, а не обе", () => {
    // Палец редко идёт строго по прямой; без выбора большей оси диагональ
    // срабатывала бы как два жеста сразу.
    expect(classifySwipe(100, 60)).toBe("right");
    expect(classifySwipe(60, 100)).toBe("down");
    expect(classifySwipe(-100, -60)).toBe("left");
  });
});

describe("isDoubleTap", () => {
  it("второй тап в пределах окна", () => {
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS - 1)).toBe(true);
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
  });

  it("первый тап двойным не бывает", () => {
    expect(isDoubleTap(null, 1000)).toBe(false);
  });

  it("время назад не считается касанием", () => {
    expect(isDoubleTap(2000, 1000)).toBe(false);
  });
});

describe("tapSide", () => {
  it("края кадра дают перемотку", () => {
    expect(tapSide(10, 400)).toBe("left");
    expect(tapSide(390, 400)).toBe("right");
  });

  it("середина не перематывает", () => {
    // Двойной тап ровно по центру — скорее промах, чем просьба перемотать.
    expect(tapSide(200, 400)).toBeNull();
  });

  it("нулевая ширина не ломает расчёт", () => {
    expect(tapSide(0, 0)).toBeNull();
  });
});
