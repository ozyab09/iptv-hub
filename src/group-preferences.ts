import { playlistScopedKey } from "./playlist-scoped-key";
export interface GroupPreferences { hidden: ReadonlySet<string>; order: readonly string[] }
export const groupPreferencesKey = (id: string): string => playlistScopedKey("groups", id);

export function parseGroupPreferences(raw: string | null): GroupPreferences {
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (data && typeof data === "object") {
      const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string"))] : [];
      return { hidden: new Set(strings("hidden" in data ? data.hidden : null)), order: strings("order" in data ? data.order : null) };
    }
  } catch { /* Повреждённое хранилище — исходные группы. */ }
  return { hidden: new Set(), order: [] };
}

export function serializeGroupPreferences(value: GroupPreferences): string {
  return JSON.stringify({ hidden: [...value.hidden], order: value.order });
}

/** Новые группы дописываются в исходном порядке; исчезнувшие пропускаются. */
export function orderedGroups(groups: readonly string[], order: readonly string[]): string[] {
  const existing = new Set(groups);
  return [...new Set([...order.filter((group) => existing.has(group)), ...groups])];
}

export function moveGroup(groups: readonly string[], order: readonly string[], group: string, step: -1 | 1): string[] {
  const next = orderedGroups(groups, order);
  const from = next.indexOf(group);
  const to = from + step;
  if (from >= 0 && to >= 0 && to < next.length) [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
