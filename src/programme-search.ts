import type { Channel, EpgProgramme } from "./types";
import { buildCatchupUrl, canWatchPast } from "./catchup";
import { channelEpgKey } from "./epg";

export interface ProgrammeMatch {
  channel: Channel;
  programme: EpgProgramme;
}

/** Пунктуация разделяет слова; названия и индексы каналов не меняем. */
function normalizeProgrammeSearch(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/[\p{P}\s]+/gu, " ").trim();
}

/**
 * Нормализованные названия считаются один раз на передачу (#357): объекты
 * EPG живут до следующей загрузки, WeakMap освобождается вместе с ними.
 */
const normalizedTitles = new WeakMap<EpgProgramme, string>();
function normalizedTitle(programme: EpgProgramme): string {
  let title = normalizedTitles.get(programme);
  if (title === undefined) {
    title = normalizeProgrammeSearch(programme.title);
    normalizedTitles.set(programme, title);
  }
  return title;
}

/** Ищем только передачи каналов активного списка; индекс id имеет приоритет. */
export function searchProgrammes(
  channels: readonly Channel[],
  epg: ReadonlyMap<string, readonly EpgProgramme[]> | null,
  query: string,
): ProgrammeMatch[] {
  const q = normalizeProgrammeSearch(query);
  if (!q || !epg) return [];
  const matches: ProgrammeMatch[] = [];
  for (const channel of channels) {
    const list = (channel.tvgId ? epg.get(channelEpgKey(channel)) : undefined)
      ?? epg.get(channelEpgKey(channel, true)) ?? [];
    const seen = new Set<string>();
    for (const programme of list) {
      if (!normalizedTitle(programme).includes(q)) continue;
      const start = Date.parse(programme.start);
      const stop = Date.parse(programme.stop);
      if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) continue;
      const key = `${programme.start}\u0000${programme.stop}\u0000${programme.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ channel, programme });
    }
  }
  return matches.sort((a, b) => Date.parse(a.programme.start) - Date.parse(b.programme.start)
    || a.channel.name.localeCompare(b.channel.name, "ru"));
}

/** Прошедшее открывается из доступного архива, иначе переходим к эфиру. */
export function programmeArchiveUrl(match: ProgrammeMatch, now: Date = new Date()): string | null {
  const info = { days: match.channel.catchupDays, source: match.channel.catchupSource };
  return canWatchPast(info, match.programme, now)
    ? buildCatchupUrl(info, match.programme, now) : null;
}
