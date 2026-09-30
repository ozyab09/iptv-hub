/**
 * Библиотека записанных эфиров (#159).
 *
 * Чистая логика метаданных над инъекцией KV-хранилища (localStorage) —
 * файлы лежат в OPFS (см. recordings-store), здесь только список:
 * канал, передача, время, длительность, размер. Формат — versioned JSON
 * в `iptv-hub.recordings.v1`.
 */

export type RecordingsKV = Pick<Storage, "getItem" | "setItem"> | null;

export interface RecordingMeta {
  /** Уникальный id записи = имя файла в OPFS. */
  id: string;
  /** Имя канала на момент записи. */
  channelName: string;
  /** URL потока (для поиска логотипа/EPG при показе, не обязателен). */
  channelUrl: string;
  /** Название передачи из EPG или null (запись вне программы). */
  programmeTitle: string | null;
  /** Начало записи, мс эпохи. */
  startedAt: number;
  /** Длительность, секунды (фактическая, на момент остановки). */
  durationSec: number;
  /** Размер файла, байты. */
  sizeBytes: number;
  /** Контейнер по head-байтам: расширение файла. */
  ext: string;
}

export const RECORDINGS_KEY = "iptv-hub.recordings.v1";
/** Лимит библиотеки: записей не больше 50, старые вытесняются. */
export const RECORDINGS_MAX = 50;

function sanitize(raw: unknown): RecordingMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: RecordingMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.id !== "string" ||
      typeof r.channelName !== "string" ||
      typeof r.startedAt !== "number" ||
      typeof r.durationSec !== "number" ||
      typeof r.sizeBytes !== "number"
    ) {
      continue;
    }
    out.push({
      id: r.id,
      channelName: r.channelName,
      channelUrl: typeof r.channelUrl === "string" ? r.channelUrl : "",
      programmeTitle: typeof r.programmeTitle === "string" ? r.programmeTitle : null,
      startedAt: r.startedAt,
      durationSec: r.durationSec,
      sizeBytes: r.sizeBytes,
      ext: typeof r.ext === "string" ? r.ext : "ts",
    });
  }
  return out;
}

/** Список записей, свежие сверху. */
export function loadRecordings(storage: RecordingsKV): RecordingMeta[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECORDINGS_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

function save(storage: RecordingsKV, list: RecordingMeta[]): void {
  if (!storage) return;
  try {
    storage.setItem(RECORDINGS_KEY, JSON.stringify(list));
  } catch {
    /* приватный режим */
  }
}

/** Добавить запись (в начало); лишние старые вытесняются. */
export function addRecording(
  storage: RecordingsKV,
  meta: RecordingMeta,
): RecordingMeta[] {
  const list = [meta, ...loadRecordings(storage).filter((r) => r.id !== meta.id)];
  const trimmed = list.slice(0, RECORDINGS_MAX);
  save(storage, trimmed);
  return trimmed;
}

/** Убрать запись из списка (файл в OPFS удаляет вызывающий). */
export function removeRecording(storage: RecordingsKV, id: string): RecordingMeta[] {
  const list = loadRecordings(storage).filter((r) => r.id !== id);
  save(storage, list);
  return list;
}

/** Запись по id или null. */
export function findRecording(
  storage: RecordingsKV,
  id: string,
): RecordingMeta | null {
  return loadRecordings(storage).find((r) => r.id === id) ?? null;
}

/** Человекочитаемый размер: Б/КБ/МБ/ГБ. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
}

/** Длительность M:SS или H:MM:SS. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
