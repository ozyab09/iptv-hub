import type { Channel } from "./types";

export interface ChannelOverride { alias: string; hidden: boolean }
export type ChannelOverrides = ReadonlyMap<string, ChannelOverride>;
export const channelOverridesKey = (id: string): string => `iptv-hub.channel-overrides.v1:${id}`;

/** Локальное оформление по URL; исходное имя для EPG остаётся в normalizedName. */
export function parseChannelOverrides(raw: string | null): ChannelOverrides {
  const result = new Map<string, ChannelOverride>();
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(data)) return result;
    for (const item of data) {
      if (!item || typeof item !== "object" || typeof item.url !== "string") continue;
      const alias = typeof item.alias === "string" ? item.alias.trim().slice(0, 120) : "";
      const hidden = item.hidden === true;
      if (alias || hidden) result.set(item.url, { alias, hidden });
    }
  } catch { /* повреждённое хранилище: исходный плейлист */ }
  return result;
}

export function serializeChannelOverrides(overrides: ChannelOverrides): string {
  return JSON.stringify([...overrides].map(([url, value]) => ({ url, ...value })));
}

export function setChannelOverride(overrides: ChannelOverrides, url: string, alias: string, hidden: boolean): ChannelOverrides {
  const next = new Map(overrides);
  const name = alias.trim().slice(0, 120);
  if (name || hidden) next.set(url, { alias: name, hidden });
  else next.delete(url);
  return next;
}

export function applyChannelOverrides(channels: readonly Channel[], overrides: ChannelOverrides, includeHidden = false): Channel[] {
  return channels.flatMap((channel) => {
    const value = overrides.get(channel.url);
    if (value?.hidden && !includeHidden) return [];
    return [{ ...channel, name: value?.alias || channel.name }];
  });
}
