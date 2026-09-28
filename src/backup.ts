/**
 * Экспорт/импорт настроек (плейлисты + избранное + тема) и recents.
 * Чистые функции: валидация и сборка JSON без localStorage — тестируются в node.
 */

export interface Backup {
  version: 1;
  exportedAt: string;
  theme: string;
  playlists: { id: string; name: string; playlistUrl: string; epgUrl: string | null }[];
  activeId: string | null;
  favorites: Record<string, string[]>;
}

export interface BackupInput {
  theme: string;
  playlists: { id: string; name: string; playlistUrl: string; epgUrl: string | null }[];
  activeId: string | null;
  favorites: Record<string, string[]>;
}

export function buildBackup(input: BackupInput): Backup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: input.theme === "light" ? "light" : "dark",
    playlists: input.playlists,
    activeId: input.activeId,
    favorites: input.favorites,
  };
}

export type ParseResult =
  | { ok: true; data: Backup }
  | { ok: false; error: string };

/** Валидация импортируемого JSON. Возвращает ошибку по-русски для тоста. */
export function parseBackup(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Файл не является корректным JSON" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Неверная структура файла" };
  }
  const b = parsed as Record<string, unknown>;
  if (b.version !== 1) return { ok: false, error: "Неподдерживаемая версия бэкапа" };
  if (!Array.isArray(b.playlists)) return { ok: false, error: "В файле нет списка плейлистов" };
  const playlists = b.playlists.filter(
    (p): p is Backup["playlists"][number] =>
      !!p &&
      typeof p === "object" &&
      typeof (p as { id?: unknown }).id === "string" &&
      typeof (p as { name?: unknown }).name === "string" &&
      typeof (p as { playlistUrl?: unknown }).playlistUrl === "string" &&
      /^https?:\/\//.test((p as { playlistUrl: string }).playlistUrl),
  );
  if (playlists.length === 0) {
    return { ok: false, error: "В бэкапе нет ни одного валидного плейлиста" };
  }
  const favorites: Record<string, string[]> = {};
  if (b.favorites && typeof b.favorites === "object") {
    for (const [k, v] of Object.entries(b.favorites as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        const urls = v.filter((x): x is string => typeof x === "string");
        if (urls.length > 0) favorites[k] = urls;
      }
    }
  }
  return {
    ok: true,
    data: {
      version: 1,
      exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : new Date().toISOString(),
      theme: b.theme === "light" ? "light" : "dark",
      playlists,
      activeId: typeof b.activeId === "string" ? b.activeId : (playlists[0]!.id),
      favorites,
    },
  };
}

// ---------- Recents ----------

export const RECENTS_MAX = 10;

/** Добавить канал в начало recents (дедап по url, ограничение длины). */
export function pushRecent(list: string[], url: string, max: number = RECENTS_MAX): string[] {
  const next = [url, ...list.filter((u) => u !== url)];
  return next.slice(0, max);
}
