/**
 * Распознавание жестов на кадре и мини-плеере.
 *
 * Правила из дизайн-системы: на телефоне вертикальный свайп по видео
 * переключает канал, двойной тап по краю перематывает на ±15с, свайп вниз
 * со страницы плеера возвращает в мини, свайп вбок по мини меняет канал.
 *
 * Чистые функции: пороги и разбор направления проверяются тестами, а не
 * подбором пальцем на телефоне.
 */

export type SwipeDirection = "up" | "down" | "left" | "right";

/** Минимальный путь, чтобы считать движение свайпом, px. */
export const SWIPE_MIN_PX = 48;

/**
 * Направление свайпа или null, если движение слишком короткое.
 *
 * Ось выбирается по бóльшему смещению: палец редко идёт строго по прямой,
 * и без этого диагональ срабатывала бы как два жеста сразу.
 */
export function classifySwipe(
  dx: number,
  dy: number,
  minPx: number = SWIPE_MIN_PX,
): SwipeDirection | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < minPx) return null;
  if (ax > ay) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** Максимальный промежуток между тапами двойного тапа, мс. */
export const DOUBLE_TAP_MS = 320;

/** Второй тап достаточно быстро после первого. */
export function isDoubleTap(
  previousTapMs: number | null,
  nowMs: number,
  maxGapMs: number = DOUBLE_TAP_MS,
): boolean {
  if (previousTapMs === null) return false;
  const gap = nowMs - previousTapMs;
  return gap >= 0 && gap <= maxGapMs;
}

/**
 * Половина кадра, по которой тапнули. Середина не нужна: двойной тап
 * ровно по центру — это скорее промах, чем просьба перемотать.
 */
export function tapSide(x: number, width: number): "left" | "right" | null {
  if (width <= 0) return null;
  const edge = width * 0.35;
  if (x < edge) return "left";
  if (x > width - edge) return "right";
  return null;
}

/** Сколько держать палец/мышь для превью канала, мс. */
export const LONG_PRESS_MS = 550;

/** Насколько допускается сдвинуться, чтобы жест остался long-press, px. */
export const LONG_PRESS_MOVE_PX = 10;

/**
 * Достаточно ли долго держали и при этом почти не сдвинулись.
 * Долгое нажатие без движения — превью; любое крупное движение — свайп/скролл.
 */
export function isLongPress(
  heldMs: number,
  movedPx: number,
  minMs: number = LONG_PRESS_MS,
  maxMovePx: number = LONG_PRESS_MOVE_PX,
): boolean {
  return heldMs >= minMs && movedPx <= maxMovePx;
}
