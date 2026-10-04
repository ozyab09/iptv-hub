import type { Channel } from "./types";

/**
 * Избранное каналов. Хранение — localStorage (privacy-first, как и конфиг).
 * Ключ элемента — URL потока: он уникален (M3U дедупится по URL в парсере),
 * стабилен между прогонами пайплайна и не зависит от эмодзи-суффиксов имени.
 */

/** Легаси-ключ эпохи до мультиплейлистов (теперь — favorites.v1:<id>). */
export const LEGACY_FAVORITES_KEY = "iptv-hub.favorites.v1";

const FAV_KEY = LEGACY_FAVORITES_KEY;

export type FavoritesStore = Storage | null;

/** Загрузить избранное. Битый JSON / не-массив — трактуем как пустое. */
export function loadFavorites(storage: FavoritesStore): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

/** Сохранить избранное (best-effort: quota/private mode — молча). */
export function saveFavorites(
  storage: FavoritesStore,
  urls: Set<string>,
): void {
  if (!storage) return;
  try {
    storage.setItem(FAV_KEY, JSON.stringify([...urls]));
  } catch {
    // нет персистентности — живём с сессией
  }
}

/** Переключить канал в избранном; возвращает новый набор. */
export function toggleFavorite(
  favs: Set<string>,
  channel: Channel,
): Set<string> {
  const next = new Set(favs);
  if (next.has(channel.url)) next.delete(channel.url);
  else next.add(channel.url);
  return next;
}

export function isFavorite(favs: Set<string>, channel: Channel): boolean {
  return favs.has(channel.url);
}

/**
 * Применить избранное к списку каналов.
 * filter=false — только сортировка (избранные сверху);
 * filter=true — только избранные (в исходном алфавитном порядке).
 */
export function applyFavorites(
  channels: Channel[],
  favs: Set<string>,
  filter: boolean,
): Channel[] {
  if (filter) return channels.filter((c) => favs.has(c.url));
  return [...channels].sort(
    (a, b) => Number(favs.has(b.url)) - Number(favs.has(a.url)),
  );
}

/** Экспорт — для будущего «поделиться избранным» / бэкапа. */
export function exportFavorites(favs: Set<string>): string {
  return JSON.stringify([...favs], null, 2);
}

/**
 * Собрать валидный M3U из избранных каналов (FR-11): #EXTM3U + #EXTINF
 * с tvg-id/tvg-logo/group-title и архивом (tvg-rec/catchup-days/
 * catchup-source), зеркала — через `|` в строке URL (#354). Пустые атрибуты
 * не пишутся. Результат парсится собственным parseM3U без потерь и
 * совместим со стандартными плеерами.
 */
export function buildFavoritesM3U(channels: Channel[], favs: Set<string>): string {
  const esc = (v: string): string => v.replace(/"/g, "'");
  const lines = ["#EXTM3U"];
  for (const c of channels) {
    if (!favs.has(c.url)) continue;
    const attrs: string[] = [];
    const put = (key: string, value: string | null | undefined): void => {
      if (value) attrs.push(`${key}="${esc(value)}"`);
    };
    put("tvg-id", c.tvgId);
    put("tvg-logo", c.logo);
    put("group-title", c.group);
    if (c.catchupDays > 0) {
      put("tvg-rec", String(c.catchupDays));
      put("catchup-days", String(c.catchupDays));
    }
    put("catchup-source", c.catchupSource);
    const head = attrs.length > 0 ? `#EXTINF:-1 ${attrs.join(" ")}` : "#EXTINF:-1";
    lines.push(`${head},${esc(c.name)}`, [c.url, ...(c.mirrors ?? [])].join("|"));
  }
  return lines.join("\n") + "\n";
}
