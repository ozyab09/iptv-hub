/**
 * Позиция просмотра VOD/catchup (FR-9): помним currentTime per-канал.
 *
 * Чистая логика над хранилищем-инъекцией (localStorage-подобный KV).
 * Для живого эфира позиция не хранится — вызывающий сам решает по
 * длительности/seekable, неэфирный ли это контент.
 * Записи старше TTL считаются устаревшими.
 */

export type PositionKV = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export const POSITIONS_KEY = "iptv-hub.positions.v1";
/** Позиции старше 7 дней забываем. */
export const POSITIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface PositionEntry {
  t: number; // секунды
  at: number; // мс эпохи, когда сохранено
}

type PositionMap = Record<string, PositionEntry>;

function load(storage: PositionKV): PositionMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(POSITIONS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PositionMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const e = v as { t?: unknown; at?: unknown };
      if (typeof e.t === "number" && typeof e.at === "number") {
        out[k] = { t: e.t, at: e.at };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save(storage: PositionKV, map: PositionMap): void {
  if (!storage) return;
  try {
    storage.setItem(POSITIONS_KEY, JSON.stringify(map));
  } catch {
    /* приватный режим */
  }
}

/**
 * Сохранить позицию канала. Перезапись целиком — объём мал (десятки каналов),
 * атомарность и простота важнее инкрементальности.
 */
export function savePosition(
  storage: PositionKV,
  url: string,
  seconds: number,
  now: number,
): void {
  if (seconds < 1) return; // начало — хранить нечего
  const map = load(storage);
  map[url] = { t: seconds, at: now };
  save(storage, map);
}

/**
 * Позиция для продолжения или null. Устаревшие записи (старе TTL)
 * отбрасываются с чисткой. Секунды до конца не досматриваем — продолжать
 * некуда.
 */
export function loadPosition(
  storage: PositionKV,
  url: string,
  now: number,
  durationSec: number = Infinity,
): number | null {
  const map = load(storage);
  const e = map[url];
  if (!e) return null;
  if (now - e.at > POSITIONS_TTL_MS) {
    delete map[url];
    save(storage, map);
    return null;
  }
  if (Number.isFinite(durationSec) && e.t > durationSec - 15) {
    return null; // почти досмотрено — начинать сначала логичнее
  }
  return e.t > 0 ? e.t : null;
}

/** Удалить позицию (например, «начать сначала» нажали). */
export function clearPosition(storage: PositionKV, url: string): void {
  const map = load(storage);
  if (delete map[url]) save(storage, map);
}
