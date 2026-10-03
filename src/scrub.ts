/**
 * Полоса эфира и локальной записи.
 *
 * У прямого потока нет конечной длительности, поэтому полоса показывает не
 * положение в файле, а ход ТЕКУЩЕЙ ПЕРЕДАЧИ по телепрограмме: от её начала
 * до конца. Отдельно считается, отстал ли зритель от прямого эфира — тогда
 * появляется «К эфиру».
 *
 * Без DOM: правила проверяются тестами, а не глазами.
 */

/** Насколько передача прошла, 0..1. Вне интервала — прижимается к границам. */
export function programmeProgress(
  nowMs: number,
  startMs: number,
  stopMs: number,
): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs)) return 0;
  const span = stopMs - startMs;
  if (span <= 0) return 0; // защита от битой программы: начало позже конца
  return Math.min(1, Math.max(0, (nowMs - startMs) / span));
}

/** Позиция указателя на полосе файла, с ограничением по её краям. */
export function scrubSeekTarget(clientX: number, left: number, width: number, duration: number): number | null {
  if (![clientX, left, width, duration].every(Number.isFinite) || width <= 0 || duration <= 0) return null;
  return Math.max(0, Math.min(1, (clientX - left) / width)) * duration;
}

/**
 * Секунды, на которые зритель отстал от прямого эфира.
 * Отрицательные значения (обгон буфера) считаем нулём.
 */
export function behindLiveSeconds(currentTime: number, liveEdge: number): number {
  if (!Number.isFinite(currentTime) || !Number.isFinite(liveEdge)) return 0;
  return Math.max(0, liveEdge - currentTime);
}

/**
 * Показывать ли «К эфиру».
 *
 * Допуск нужен: HLS почти всегда отдаёт край буфера на несколько секунд
 * впереди воспроизведения, и без него кнопка висела бы всегда.
 */
export const LIVE_TOLERANCE_SEC = 20;

export function isBehindLive(
  currentTime: number,
  liveEdge: number,
  toleranceSec: number = LIVE_TOLERANCE_SEC,
): boolean {
  return behindLiveSeconds(currentTime, liveEdge) > toleranceSec;
}

/** Цель перемотки только внутри реально загруженных диапазонов, без дыр. */
export function bufferedSeekTarget(
  current: number,
  delta: number,
  ranges: ReadonlyArray<{ start: number; end: number }>,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(delta)) return null;
  const desired = current + delta;
  let target: number | null = null;
  for (const { start, end } of ranges) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const candidate = Math.max(start, Math.min(desired, Math.max(start, end - 0.1)));
    if (target === null || Math.abs(candidate - desired) < Math.abs(target - desired)) target = candidate;
  }
  return target;
}

/** Время в 24-часовом формате для краёв полосы. */
export function clock(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ms);
}

/** Шкала файла: до загрузки длительности используем метаданные записи. */
export function mediaScrub(currentTime: number, duration: number, fallbackDuration = 0) {
  const total = Number.isFinite(duration) && duration > 0 ? duration
    : Number.isFinite(fallbackDuration) && fallbackDuration > 0 ? fallbackDuration : 0;
  const position = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const format = (seconds: number): string => {
    const whole = Math.floor(seconds);
    return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  };
  return {
    position: format(position),
    duration: format(total),
    progress: total > 0 ? Math.min(1, position / total) : 0,
  };
}
