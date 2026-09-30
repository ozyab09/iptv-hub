/**
 * Скриншот кадра (FR-14): имя файла и причина отказа.
 * Чистая логика; захват канваса — в UI-слое.
 */

/** Имя файла скриншота: канал + дата/время. */
export function screenshotFileName(channelName: string, now: Date): string {
  const safe = channelName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  const ts = now.toISOString().slice(0, 19).replace(/[T:]/g, "-");
  return `${safe || "frame"}-${ts}.png`;
}

export type ShotFailure =
  | "tainted" // cross-origin без CORS: канвас запачкан, браузер не даёт
  | "empty"; // кадра ещё нет (videoWidth = 0)

/** Человеческое сообщение по причине отказа. */
export function describeShotFailure(reason: ShotFailure): string {
  if (reason === "tainted") {
    return "Браузер не даёт снять кадр: поток с чужого домена без CORS-заголовков. Это ограничение платформы, не баг плеера.";
  }
  return "Кадр ещё не готов — подождите пару секунд и попробуйте снова.";
}
