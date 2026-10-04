import { parseM3U } from "./m3u";
import type { PlaylistSnapshot } from "./types";

export interface XtreamSource {
  host: string;
  username: string;
  password: string;
}

/** Проверка ввода без сети; префикс пути панели сохраняется. */
export function validateXtream(source: XtreamSource): XtreamSource | null {
  try {
    const host = new URL(source.host.trim());
    if (host.protocol !== "https:" || host.username || host.password || host.search || host.hash) return null;
    if (!source.username || !source.password || [source.username, source.password].some((v) => /^\.{1,2}$/.test(v))) return null;
    return { ...source, host: host.href.replace(/\/+$/, "") };
  } catch { return null; }
}

export function xtreamApiUrl(source: XtreamSource, action: "get_live_streams" | "get_live_categories"): string {
  const url = new URL(`${source.host}/player_api.php`);
  url.search = new URLSearchParams({ username: source.username, password: source.password, action }).toString();
  return url.href;
}

export function xtreamEpgUrl(source: XtreamSource): string {
  const url = new URL(`${source.host}/xmltv.php`);
  url.search = new URLSearchParams({ username: source.username, password: source.password }).toString();
  return url.href;
}

/** API-ссылка хранится в обычном playlistUrl: миграция и новый формат backup не нужны. */
export function readXtreamUrl(value: string): XtreamSource | null {
  try {
    const url = new URL(value);
    if (!url.pathname.endsWith("/player_api.php") || url.searchParams.get("action") !== "get_live_streams") return null;
    return validateXtream({
      host: url.origin + url.pathname.slice(0, -"/player_api.php".length),
      username: url.searchParams.get("username") ?? "",
      password: url.searchParams.get("password") ?? "",
    });
  } catch { return null; }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
// Метаданные не могут добавлять атрибуты или строки M3U.
const attribute = (value: string): string => value.replace(/[\r\n]/g, " ").replaceAll('"', "'");

/** Ответ live API → обычный снимок через общий M3U-парсер. */
export function parseXtream(source: XtreamSource, streams: unknown, categories: unknown): PlaylistSnapshot {
  if (!Array.isArray(streams) || !Array.isArray(categories)) throw new Error("Xtream: invalid response");
  const groups = new Map<string, string>();
  for (const item of categories) {
    const group = record(item);
    if (group) groups.set(text(group.category_id), text(group.category_name));
  }
  const credentials = `${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}`;
  const rows = [`#EXTM3U tvg-url="${xtreamEpgUrl(source)}"`];
  for (const item of streams) {
    const stream = record(item);
    if (!stream || (stream.stream_type && stream.stream_type !== "live" && typeof stream.stream_type !== "number")) continue;
    const id = text(stream.stream_id);
    const name = text(stream.name);
    if (!/^\d+$/.test(id) || !name.trim()) continue;
    const logo = text(stream.stream_icon);
    const logoAttribute = logo.startsWith("https://") ? ` tvg-logo="${attribute(logo)}"` : "";
    const days = text(stream.tv_archive) === "1" ? Math.max(0, Math.floor(Number(stream.tv_archive_duration) || 0)) : 0;
    const archive = days > 0
      ? ` catchup-days="${days}" catchup-source="${source.host}/timeshift/${credentials}/{duration_minutes}/{start_utc}/${id}.m3u8"` : "";
    rows.push(`#EXTINF:-1 tvg-id="${attribute(text(stream.epg_channel_id))}"${logoAttribute} group-title="${attribute(groups.get(text(stream.category_id)) ?? "")}"${archive},${name.replace(/[\r\n]/g, " ")}`);
    rows.push(`${source.host}/live/${credentials}/${id}.m3u8`);
  }
  return parseM3U(rows.join("\n"));
}
