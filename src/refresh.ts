/**
 * Периодическое обновление плейлиста.
 *
 * Плейлист сохранён в localStorage, но его содержимое живёт, пока страницу
 * не перезагрузят: провайдер добавил канал или закрыл поток — пользователь
 * узнает об этом только завтра. Здесь — чистая логика: выбранная
 * периодичность (localStorage), «пора ли проверять» и разница снапшотов
 * для уведомления в колокольчик. Без DOM/fetch — тестируется в node
 * (принцип проекта); сеть и таймеры — в main.ts.
 */

import type { Channel, EpgProgramme, PlaylistSnapshot } from "./types";
import { t, type Language } from "./i18n";

/** Периодичность проверки, минут (0 — выключено). */
export type RefreshInterval = 0 | 60 | 360 | 1440;

export const REFRESH_CHOICES: ReadonlyArray<{
  value: RefreshInterval;
  label: string;
}> = [
  { value: 0, label: "Выключено" },
  { value: 60, label: "Каждый час" },
  { value: 360, label: "Раз в 6 часов" },
  { value: 1440, label: "Раз в сутки" },
];

const REFRESH_KEY = "iptv-hub.refresh.v1";
const LAST_KEY = "iptv-hub.refresh-last.v1";

type KV = Pick<Storage, "getItem" | "setItem"> | null;

/** Разобрать сохранённый интервал: чужое/битое значение — выключено. */
export function parseInterval(raw: string | null): RefreshInterval {
  const n = Number(raw);
  return REFRESH_CHOICES.some((c) => c.value === n) ? (n as RefreshInterval) : 0;
}

export function loadInterval(storage: KV): RefreshInterval {
  if (!storage) return 0;
  try {
    return parseInterval(storage.getItem(REFRESH_KEY));
  } catch {
    return 0;
  }
}

export function saveInterval(interval: RefreshInterval, storage: KV): void {
  if (!storage) return;
  try {
    storage.setItem(REFRESH_KEY, String(interval));
  } catch {
    /* приватный режим / quota — молча */
  }
}

/** Время последней успешной проверки (мс), 0 — никогда. */
export function loadLastCheck(storage: KV): number {
  if (!storage) return 0;
  try {
    const n = Number(storage.getItem(LAST_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveLastCheck(now: number, storage: KV): void {
  if (!storage) return;
  try {
    storage.setItem(LAST_KEY, String(now));
  } catch {
    /* молча */
  }
}

/**
 * Пора ли проверять: интервал включён, и с последней проверки прошло
 * не меньше его. Никогда не проверявшийся плейлист проверяется сразу —
 * снапшот уже на экране, первому фону подтверждение не помешает.
 */
export function shouldCheck(
  now: number,
  last: number,
  interval: RefreshInterval,
): boolean {
  if (interval === 0) return false;
  if (last === 0) return true;
  return now - last >= interval * 60_000;
}

/** Считать канал изменённым, если поменялся любой атрибут, кроме порядка. */
function sameChannel(a: Channel, b: Channel): boolean {
  return (
    a.name === b.name &&
    a.group === b.group &&
    a.logo === b.logo &&
    a.tvgId === b.tvgId &&
    a.quality === b.quality &&
    a.catchupDays === b.catchupDays &&
    a.catchupSource === b.catchupSource
  );
}

export interface SnapshotDiff {
  added: number;
  removed: number;
  changed: number;
}

/** Разница снапшотов по URL: что добавить в уведомление колокольчика. */
export function diffSnapshots(
  before: PlaylistSnapshot,
  after: PlaylistSnapshot,
): SnapshotDiff {
  const beforeByUrl = new Map(before.channels.map((c) => [c.url, c]));
  const afterByUrl = new Map(after.channels.map((c) => [c.url, c]));

  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const c of after.channels) {
    const prev = beforeByUrl.get(c.url);
    if (!prev) added++;
    else if (!sameChannel(prev, c)) changed++;
  }
  for (const c of before.channels) {
    if (!afterByUrl.has(c.url)) removed++;
  }
  return { added, removed, changed };
}

/** Текст уведомления по результату проверки (без итоговых чисел — см. checkSummary). */
export function refreshNotice(
  diff: SnapshotDiff,
  httpDropped: number,
  language: Language = "ru",
): string {
  if (diff.added === 0 && diff.removed === 0 && diff.changed === 0 && httpDropped === 0) {
    return t("refresh.unchanged", language);
  }
  const parts: string[] = [];
  if (diff.added > 0) parts.push(`+${diff.added}`);
  if (diff.removed > 0) parts.push(`−${diff.removed}`);
  if (diff.changed > 0) parts.push(t("refresh.changed", language, { count: diff.changed }));
  const head = parts.length > 0 ? t("refresh.updated", language, { changes: parts.join(", ") }) : t("refresh.updatedPlain", language);
  if (httpDropped > 0) {
    return `${head}. ${t("refresh.httpDropped", language, { count: httpDropped })}`;
  }
  return head;
}

/** Сколько передач в телепрограмме (сумма длин всех списков). */
export function countProgrammes(epg: Map<string, EpgProgramme[]>): number {
  let total = 0;
  for (const list of epg.values()) total += list.length;
  return total;
}

/**
 * Итог проверки для колокольчика: дельта плейлиста (если была) + сколько
 * теперь каналов и передач. Отвечает на главный вопрос «что у меня сейчас»,
 * а не только «что изменилось».
 */
export function checkSummary(
  diff: SnapshotDiff,
  channels: number,
  programmes: number,
  epgLoaded: boolean,
  language: Language = "ru",
): string {
  const parts: string[] = [];
  if (diff.added > 0) parts.push(`+${diff.added}`);
  if (diff.removed > 0) parts.push(`−${diff.removed}`);
  if (diff.changed > 0) parts.push(t("refresh.changed", language, { count: diff.changed }));
  const epgPart = epgLoaded ? t("refresh.programmes", language, { count: programmes }) : t("refresh.noProgrammes", language);
  const head =
    parts.length > 0
      ? t("refresh.updated", language, { changes: parts.join(", ") })
      : t("refresh.unchanged", language);
  return t("refresh.summary", language, { head, channels, epg: epgPart });
}
