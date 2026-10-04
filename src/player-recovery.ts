/**
 * Правила восстановления потока (#376): сколько раз переподключаться,
 * лечить декодер и как спасать mixed content. Чистые функции — покрыты
 * тестами без DOM и hls.js.
 */
import { isPrivateHost } from "./config";

/**
 * Сколько подряд сетевых сбоев переживаем, прежде чем сдаться. Без предела
 * заблокированный или мёртвый поток крутит переподключение вечно, показывая
 * один и тот же тост и не давая пользователю понять, что канал не работает.
 */
export const MAX_NETWORK_RETRIES = 3;

/**
 * Восстановлений декодера (recoverMediaError) подряд, прежде чем сдаться:
 * hls.js советует не больше пары на поток — нечинящаяся ошибка иначе крутит
 * «ошибка → recover → ошибка» вечно (#350). Ошибки дальше окна друг от друга
 * считаются новыми: редкие сбои долгого эфира не копятся.
 */
export const MAX_MEDIA_RECOVERIES = 2;
export const MEDIA_RECOVERY_WINDOW_MS = 60_000;

/** Стоит ли ещё раз перезапускать загрузку после сетевого сбоя. */
export function shouldRetryNetwork(consecutiveFailures: number): boolean {
  return consecutiveFailures <= MAX_NETWORK_RETRIES;
}

/** Счётчик подряд идущих media-ошибок и время последней. */
export interface MediaRecoveryState {
  count: number;
  at: number;
}

/** Учесть новую media-ошибку: в пределах окна — следующая подряд, иначе первая. */
export function nextMediaRecovery(prev: MediaRecoveryState | null, now: number): MediaRecoveryState {
  const count = prev && now - prev.at < MEDIA_RECOVERY_WINDOW_MS ? prev.count + 1 : 1;
  return { count, at: now };
}

/** Стоит ли ещё раз вызывать recoverMediaError() (#350). */
export function shouldRecoverMedia(consecutiveErrors: number): boolean {
  return consecutiveErrors <= MAX_MEDIA_RECOVERIES;
}

/**
 * http→https для спасения потока на https-странице (mixed content).
 * Возвращает null, если апгрейд не имеет смысла: URL не http, кривой,
 * или адрес локальный/приватный (localhost, RFC1918) — у таких хостов
 * TLS на 443 обычно не поднят.
 */
export function httpToHttps(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:") return null;
    // Исключения для локальных/приватных адресов — общий предикат с фильтром
    // http-каналов в m3u.ts, чтобы оба решения не разъехались.
    if (isPrivateHost(u.hostname)) return null;
    u.protocol = "https:";
    if (u.port === "80") u.port = ""; // :80 → дефолтный https-порт 443
    return u.toString();
  } catch {
    return null;
  }
}
