import type { Channel } from "./types";

export interface ChannelOverride { alias: string; hidden: boolean; epgId?: string }
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
      const epgId = typeof item.epgId === "string" ? item.epgId.trim().slice(0, 120) : "";
      if (alias || hidden || epgId) result.set(item.url, { alias, hidden, ...(epgId ? { epgId } : {}) });
    }
  } catch { /* повреждённое хранилище: исходный плейлист */ }
  return result;
}

export function serializeChannelOverrides(overrides: ChannelOverrides): string {
  return JSON.stringify([...overrides].map(([url, value]) => ({ url, ...value })));
}

export function setChannelOverride(overrides: ChannelOverrides, url: string, alias: string, hidden: boolean, epgId?: string): ChannelOverrides {
  const next = new Map(overrides);
  const name = alias.trim().slice(0, 120);
  const id = (epgId ?? overrides.get(url)?.epgId ?? "").trim().slice(0, 120);
  if (name || hidden || id) next.set(url, { alias: name, hidden, ...(id ? { epgId: id } : {}) });
  else next.delete(url);
  return next;
}

export function applyChannelOverrides(channels: readonly Channel[], overrides: ChannelOverrides, includeHidden = false): Channel[] {
  return channels.flatMap((channel) => {
    const value = overrides.get(channel.url);
    if (value?.hidden && !includeHidden) return [];
    return [{ ...channel, name: value?.alias || channel.name, tvgId: value?.epgId || channel.tvgId }];
  });
}
