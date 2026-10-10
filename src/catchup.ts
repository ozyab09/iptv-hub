import { t, type Language } from "./i18n";
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
 * Xtream: {duration_minutes} — округление вверх до минут,
 * {start_utc} — начало в UTC, YYYY-MM-DD:HH-MM.
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
    .replaceAll("{duration_minutes}", String(Math.ceil(duration / 60)))
    .replaceAll("{start_utc}", info.source.includes("{start_utc}") ? new Date(prog.start).toISOString().slice(0, 16).replace("T", ":").replace(/:(\d{2})$/, "-$1") : "")
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

/** Начать текущую передачу с первой секунды, если начало ещё доступно в архиве. */
export function programmeStartUrl(info: CatchupInfo, prog: EpgProgramme | null, now: Date = new Date()): string | null {
  if (!prog || info.days <= 0) return null;
  const elapsed = now.getTime() - Date.parse(prog.start);
  if (!(elapsed >= 1000 && elapsed <= info.days * 86_400_000 && now.getTime() < Date.parse(prog.stop))) return null;
  return buildCatchupUrl(info, prog, now);
}

// ---------- Дни для вкладок гайда ----------

const HOUR = 3_600_000;

/**
 * Часовые слоты «без названия» (#314): для каналов без телепрограммы, но
 * с архивом гайд показывает по одному часу назад на неделю (7 × 24 = 168
 * позиций). Слоты заканчиваются на границе текущего часа — текущий час
 * играет как эфир, прошедшие открываются через catchup (в пределах глубины
 * архива, как обычные передачи). Слоты идут от старых к новым.
 */
export function hourlyFallbackProgrammes(
  now: Date = new Date(),
  days = 7,
): EpgProgramme[] {
  const out: EpgProgramme[] = [];
  const end = now.getTime();
  // Начало текущего часа: последний слот, который ещё не закончился.
  let stop = Math.floor(end / HOUR) * HOUR;
  const horizon = end - days * 86_400_000;
  while (stop > horizon) {
    const start = stop - HOUR;
    out.push({
      start: new Date(start).toISOString(),
      stop: new Date(stop).toISOString(),
      title: "Без названия",
      desc: null,
    });
    stop = start;
  }
  // От старых к новым — порядок рендера списка гайда.
  return out.reverse();
}


/**
 * Часовые слоты вокруг текущего часа для блока программы (#472): канал
 * без EPG получает «расписание» из часа — прошедшие слоты открываются через
 * catchup, текущий играет как эфир, будущие неактивны. Слоты идут от старых
 * к новым; title пустой — UI показывает локализованное «Без названия» серым.
 */
export function hourlyScheduleSlots(
  now: Date,
  pastHours: number,
  futureHours: number,
): EpgProgramme[] {
  const hourStart = Math.floor(now.getTime() / HOUR) * HOUR;
  const out: EpgProgramme[] = [];
  for (let i = -pastHours; i < futureHours; i++) {
    const start = hourStart + i * HOUR;
    out.push({
      start: new Date(start).toISOString(),
      stop: new Date(start + HOUR).toISOString(),
      title: "",
      desc: null,
    });
  }
  return out;
}


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
export function dayWindows(now: Date = new Date(), language: Language = "ru"): DayWindow[] {
  const today = localMidnight(now);
  const out: DayWindow[] = [];
  for (let i = 0; i <= MAX_CATCHUP_DAYS; i++) {
    const start = today - i * DAY;
    out.push({
      startMs: start,
      endMs: start + DAY,
      label:
        i === 0
          ? t("guide.today", language)
          : i === 1
            ? t("guide.yesterday", language)
            : new Date(start).toLocaleDateString(language, {
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
