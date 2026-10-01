import type { EpgProgramme } from "./types";

/**
 * Catchup (архив эфира). Возможности канала задаются атрибутами M3U:
 *  - `tvg-rec="N"` / `catchup-days="N"` — глубина архива в днях;
 *  - `catchup="default|append|shift|flussonic"` — флаг наличия архива;
 *  - `catchup-source="...{utc}...{lutc}..."` — шаблон URL архива провайдера.
 * Родительский пайплайн (iptv) сохраняет tvg-rec в плейлисте.
 */

export const MAX_CATCHUP_DAYS = 3;

export interface CatchupInfo {
  /** Глубина архива в днях (0 — архив недоступен). */
  days: number;
  /** Шаблон URL провайдера (с плейсхолдерами), если задан. */
  source: string | null;
}

/** Распарсить catchup-возможности канала из атрибутов #EXTINF. */
export function parseCatchup(
  tvgRec: string | null,
  catchupDays: string | null,
  catchup: string | null,
  catchupSource: string | null,
): CatchupInfo {
  let days = 0;
  const fromRec = tvgRec ? Number.parseInt(tvgRec, 10) : NaN;
  const fromAttr = catchupDays ? Number.parseInt(catchupDays, 10) : NaN;
  if (Number.isFinite(fromRec) && fromRec > 0) days = fromRec;
  if (Number.isFinite(fromAttr) && fromAttr > 0) days = Math.max(days, fromAttr);
  // catchup="1"/"default"/... без числа — минимальный архив 1 день
  if (days === 0 && catchup && catchup !== "0") days = 1;
  return { days: Math.min(days, MAX_CATCHUP_DAYS), source: catchupSource ?? null };
}

/**
 * Собрать URL архива для передачи. Известные плейсхолдеры провайдеров:
 * {utc} / {start} — начало передачи (unix), {lutc} / {now} — текущий момент,
 * {duration} — длительность в секундах, {offset} — сдвиг от «сейчас» (сек).
 * Возвращает null, если шаблона нет.
 */
export function buildCatchupUrl(
  info: CatchupInfo,
  prog: EpgProgramme,
  now: Date = new Date(),
): string | null {
  if (!info.source) return null;
  const startSec = Math.floor(Date.parse(prog.start) / 1000);
  const endSec = Math.floor(Date.parse(prog.stop) / 1000);
  const duration = Math.max(0, endSec - startSec);
  const lutc = Math.floor(now.getTime() / 1000);
  const offset = lutc - startSec;
  return info.source
    .replaceAll("{utc}", String(startSec))
    .replaceAll("{start}", String(startSec))
    .replaceAll("{duration}", String(duration))
    .replaceAll("{lutc}", String(lutc))
    .replaceAll("{now}", String(lutc))
    .replaceAll("{offset}", String(offset));
}

/** Архивность: можно ли смотреть передачу из прошлого на этом канале. */
export function canWatchPast(info: CatchupInfo, prog: EpgProgramme, now: Date = new Date()): boolean {
  if (info.days <= 0) return false;
  const ageDays = (now.getTime() - Date.parse(prog.stop)) / 86_400_000;
  return ageDays >= 0 && ageDays <= info.days;
}

// ---------- Дни для вкладок гайда ----------

const DAY = 86_400_000;

export interface DayWindow {
  /** Начало дня, ms epoch. */
  startMs: number;
  /** Конец дня (исключительно), ms epoch. */
  endMs: number;
  /** Метка вкладки: «Сегодня», «Вчера», «сб 26.09». */
  label: string;
}

function localMidnight(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/**
 * Окна дней для гайда: сегодня + MAX_CATCHUP_DAYS назад.
 * index 0 = сегодня, 1 = вчера, …
 */
export function dayWindows(now: Date = new Date()): DayWindow[] {
  const today = localMidnight(now);
  const out: DayWindow[] = [];
  for (let i = 0; i <= MAX_CATCHUP_DAYS; i++) {
    const start = today - i * DAY;
    out.push({
      startMs: start,
      endMs: start + DAY,
      label:
        i === 0
          ? "Сегодня"
          : i === 1
            ? "Вчера"
            : new Date(start).toLocaleDateString("ru-RU", {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
              }),
    });
  }
  return out;
}

/** Передачи, пересекающие окно дня, отсортированные по началу. */
export function programmesInDay(
  list: EpgProgramme[],
  window: DayWindow,
): EpgProgramme[] {
  return list
    .filter(
      (p) => Date.parse(p.stop) > window.startMs && Date.parse(p.start) < window.endMs,
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
