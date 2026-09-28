/**
 * Запись эфира в локальный файл.
 * Сама запись — MediaRecorder поверх video.captureStream() в player.ts/main.ts;
 * здесь — чистая логика: имя файла, выбор mime, валидация состояния.
 */

/** Внутреннее состояние записи. */
export type RecState = "idle" | "recording";

/**
 * Имя файла записи: «Channel_2026-09-28_15-42.webm».
 * Небезопасные для ФС символы заменяются на «_».
 */
export function recordingFileName(channelName: string, at: Date = new Date()): string {
  const safe = channelName.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const pad = (n: number): string => String(n).padStart(2, "0");
  const ts = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}-${pad(at.getMinutes())}`;
  return `${safe || "recording"}_${ts}.webm`;
}

/**
 * Выбрать поддерживаемый браузером mime-тип (приоритет — с аудио).
 * Возвращает null, если запись не поддерживается.
 */
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Можно ли вообще записывать в этом браузере. */
export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    pickRecorderMime() !== null
  );
}

/**
 * Валидация операции: стартовать можно из idle, останавливать — из recording.
 * Возвращает null (ok) или текст ошибки для тоста.
 */
export function validateRecOp(
  state: RecState,
  op: "start" | "stop",
): string | null {
  if (op === "start" && state === "recording") return "Запись уже идёт";
  if (op === "stop" && state !== "recording") return "Запись не запущена";
  return null;
}
