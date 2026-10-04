import { detectQuality, isPlayableStreamUrl, normalizeName } from "./m3u";
import { xtreamApiUrl, type XtreamSource } from "./xtream";
import type { Channel } from "./types";

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
const poster = (value: unknown): string | null => {
  try { const url = new URL(text(value)); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
};

function mediaUrl(source: XtreamSource, kind: "movie" | "episode", item: Record<string, unknown>): string | null {
  const direct = text(item.stream_url) || text(item.direct_source);
  if (direct) return /^https?:\/\//i.test(direct) && isPlayableStreamUrl(direct) ? direct : null;
  const id = text(kind === "movie" ? item.stream_id : item.id);
  const ext = text(item.container_extension) || "mp4";
  if (!/^\d+$/.test(id) || !/^[a-z0-9]+$/i.test(ext)) return null;
  return `${source.host}/${kind === "movie" ? "movie" : "series"}/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${id}.${ext}`;
}

function channel(name: string, url: string, group: string, logo: unknown, kind: NonNullable<Channel["mediaKind"]>): Channel {
  return { name, normalizedName: normalizeName(name), url, group, logo: poster(logo), mediaKind: kind,
    tvgId: null, quality: detectQuality(name), catchupDays: 0, catchupSource: null };
}

/** Фильмы и сериалы остаются совместимыми с общими поиском, PIN и плеером. */
export function parseXtreamCatalogue(source: XtreamSource, kind: "movie" | "series", items: unknown, categories: unknown): Channel[] {
  if (!Array.isArray(items) || !Array.isArray(categories)) throw new Error("Invalid Xtream catalogue");
  const groups = new Map(categories.flatMap((value) => {
    const item = object(value);
    return item ? [[text(item.category_id), text(item.category_name)] as const] : [];
  }));
  const entries = items.flatMap((value): Channel[] => {
    const item = object(value);
    if (!item || !text(item.name).trim()) return [];
    const seriesId = text(item.series_id);
    const url = kind === "series" ? (/^\d+$/.test(seriesId) ? xtreamApiUrl(source, "get_series_info", seriesId) : null) : mediaUrl(source, "movie", item);
    if (!url) return [];
    const entry = channel(text(item.name), url, groups.get(text(item.category_id)) || "Основные", kind === "series" ? item.cover : item.stream_icon, kind);
    return [{ ...entry, ...(kind === "series" ? { seriesId } : {}) }];
  });
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Эпизоды сортируются численно по сезону и номеру, а не по имени. */
export function parseXtreamEpisodes(source: XtreamSource, series: Channel, response: unknown): Channel[] {
  const data = object(response);
  const seasons = object(data?.episodes);
  if (!seasons && !Array.isArray(data?.episodes)) throw new Error("Invalid Xtream episodes");
  const groups = Array.isArray(data?.episodes) && data.episodes.some((item) => object(item)?.id !== undefined)
    ? { "0": data.episodes } : seasons ?? data!.episodes as unknown[];
  const result = Object.entries(groups).flatMap(([season, values]): Channel[] => {
    if (!Array.isArray(values)) return [];
    return values.flatMap((value): Channel[] => {
      const item = object(value);
      if (!item) return [];
      const url = mediaUrl(source, "episode", item);
      if (!url) return [];
      const info = object(item.info);
      return [{ ...channel(text(item.title) || `${series.name} · ${text(item.episode_num)}`, url, series.group,
        info?.movie_image ?? series.logo, "episode"), seriesId: series.seriesId, season: Number(item.season ?? season) || 0, episode: Number(item.episode_num) || 0 }];
    });
  });
  return [...new Map(result.map((entry) => [entry.url, entry])).values()].sort((a, b) => a.season! - b.season! || a.episode! - b.episode!);
}

export function resumeEpisode(episodes: readonly Channel[], recents: readonly string[]): Channel | null {
  return recents.map((url) => episodes.find((episode) => episode.url === url)).find(Boolean) ?? episodes[0] ?? null;
}
