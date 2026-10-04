import { playlistScopedKey } from "./playlist-scoped-key";
import type { Channel } from "./types";

export const favoritesOrderKey = (id: string): string => playlistScopedKey("favorites-order", id);

export function parseFavoritesOrder(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (Array.isArray(value)) return [...new Set(value.filter((url): url is string => typeof url === "string" && url.length > 0))];
  } catch { /* Повреждённый порядок — исходный список. */ }
  return [];
}

/** Сохраняет порядок существующих избранных, новые добавляет в конец. */
export function applyFavoritesOrder(channels: readonly Channel[], favorites: ReadonlySet<string>, order: readonly string[]): Channel[] {
  const byUrl = new Map(channels.filter((channel) => favorites.has(channel.url)).map((channel) => [channel.url, channel]));
  return [...new Set([...order, ...byUrl.keys()])].flatMap((url) => {
    const channel = byUrl.get(url);
    return channel ? [channel] : [];
  });
}

/** Перенос в позицию другой строки; подходит для drop и соседних Alt+стрелок. */
export function moveFavorite(order: readonly string[], url: string, target: string): string[] {
  const next = [...order];
  const from = next.indexOf(url);
  const to = next.indexOf(target);
  if (from >= 0 && to >= 0 && from !== to) next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
