/**
 * Полоса перемотки живого эфира.
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

/** Время в 24-часовом формате для краёв полосы. */
export function clock(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ms);
}
