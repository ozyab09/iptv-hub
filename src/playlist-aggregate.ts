import { applyChannelOverrides, type ChannelOverrides } from "./channel-overrides";
import type { Channel, EpgProgramme, PlaylistSnapshot } from "./types";

export interface AggregateSource {
  id: string; name: string; snapshot: PlaylistSnapshot;
  overrides: ChannelOverrides; hiddenGroups: ReadonlySet<string>;
  epg: ReadonlyMap<string, EpgProgramme[]> | null;
}

/** JSON сохраняет границы ID источника и ключа провайдера. */
export function sourceEpgKey(id: string, key: string): string {
  return JSON.stringify([id, key]);
}

/** Первый источник владеет URL, даже когда его канал скрыт. */
export function aggregatePlaylists(sources: readonly AggregateSource[]): {
  snapshot: PlaylistSnapshot; epg: Map<string, EpgProgramme[]>;
} {
  const seen = new Set<string>();
  const channels: Channel[] = [];
  const groups = new Map<string, Set<string>>();
  const epg = new Map<string, EpgProgramme[]>();
  for (const source of sources) {
    for (const [key, programmes] of source.epg ?? []) epg.set(sourceEpgKey(source.id, key), programmes);
    for (const original of source.snapshot.channels) {
      if (seen.has(original.url)) continue;
      seen.add(original.url);
      const channel = applyChannelOverrides([original], source.overrides)[0];
      if (!channel || source.hiddenGroups.has(channel.group)) continue;
      const ids = groups.get(channel.group) ?? new Set<string>();
      ids.add(source.id); groups.set(channel.group, ids);
      channels.push({ ...channel, source: { id: source.id, name: source.name, group: channel.group } });
    }
  }
  for (const channel of channels) {
    if (groups.get(channel.group)!.size > 1) channel.group = `${channel.source!.name} · ${channel.group}`;
  }
  return { snapshot: { channels, categories: [...new Set(channels.map(c => c.group))],
    headerTvgUrl: null, droppedHttp: sources.reduce((n, s) => n + s.snapshot.droppedHttp, 0) }, epg };
}
