/**
 * Список плейлистов. Хранение — localStorage (privacy-first):
 *   - `iptv-hub.playlists.v1` — массив { id, name, playlistUrl, epgUrl };
 *   - активный — `iptv-hub.active-playlist.v1` (id).
 * Миграция со старого одиночного `iptv-hub.config.v1` происходит лениво
 * при первом обращении; старые данные не удаляются (обратная совместимость).
 * Избранное живёт по ключу `iptv-hub.favorites.v1:<id>` (см. favorites).
 */

export interface Playlist {
  /** Стабильный id (timestamp при создании). */
  id: string;
  /** Произвольное имя для человека. */
  name: string;
  playlistUrl: string;
  /** EPG необязателен. */
  epgUrl: string | null;
}

export interface PlaylistsState {
  items: Playlist[];
  activeId: string | null;
}

export const PLAYLISTS_KEY = "iptv-hub.playlists.v1";
export const ACTIVE_KEY = "iptv-hub.active-playlist.v1";
/** Ключ избранного конкретного плейлиста. */
export function favoritesKey(id: string): string {
  return `iptv-hub.favorites.v1:${id}`;
}
/** Легаси-ключ одиночного конфига (для миграции). */
export const LEGACY_CONFIG_KEY = "iptv-hub.config.v1";

export type KV = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Миграция: старый одиночный конфиг → первый элемент списка. Идемпотентна. */
export function migrateLegacy(storage: KV): void {
  if (!storage) return;
  try {
    if (storage.getItem(PLAYLISTS_KEY)) return; // уже мигрировано/создано
    const raw = storage.getItem(LEGACY_CONFIG_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { playlistUrl?: unknown; epgUrl?: unknown };
    if (!isHttpUrl(saved.playlistUrl)) return;
    const pl: Playlist = {
      id: String(Date.now()),
      name: "Основной",
      playlistUrl: saved.playlistUrl,
      epgUrl: isHttpUrl(saved.epgUrl) ? saved.epgUrl : null,
    };
    storage.setItem(PLAYLISTS_KEY, JSON.stringify([pl]));
    storage.setItem(ACTIVE_KEY, pl.id);
  } catch {
    // битые данные — начинаем с пустого списка
  }
}

function sanitize(raw: unknown): Playlist[] {
  if (!Array.isArray(raw)) return [];
  const out: Playlist[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== "string" || typeof p.name !== "string") continue;
    if (!isHttpUrl(p.playlistUrl)) continue;
    out.push({
      id: p.id,
      name: p.name,
      playlistUrl: p.playlistUrl,
      epgUrl: isHttpUrl(p.epgUrl) ? p.epgUrl : null,
    });
  }
  return out;
}

/** Загрузить состояние (с ленивой миграцией). */
export function loadPlaylists(storage: KV): PlaylistsState {
  migrateLegacy(storage);
  if (!storage) return { items: [], activeId: null };
  try {
    const items = sanitize(JSON.parse(storage.getItem(PLAYLISTS_KEY) ?? "[]"));
    const activeId = storage.getItem(ACTIVE_KEY);
    return {
      items,
      activeId: items.some((p) => p.id === activeId) ? activeId : (items[0]?.id ?? null),
    };
  } catch {
    return { items: [], activeId: null };
  }
}

/** Сохранить состояние целиком (best-effort). */
export function savePlaylists(storage: KV, state: PlaylistsState): void {
  if (!storage) return;
  try {
    storage.setItem(PLAYLISTS_KEY, JSON.stringify(state.items));
    if (state.activeId) storage.setItem(ACTIVE_KEY, state.activeId);
    else storage.removeItem(ACTIVE_KEY);
  } catch {
    // приватный режим
  }
}

/** Новый id. */
export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Добавить плейлист; возвращает новое состояние. */
export function addPlaylist(
  state: PlaylistsState,
  name: string,
  playlistUrl: string,
  epgUrl: string | null,
): PlaylistsState {
  const pl: Playlist = { id: newId(), name: name.trim() || "Плейлист", playlistUrl, epgUrl };
  const items = [...state.items, pl];
  return { items, activeId: state.activeId ?? pl.id };
}

/** Переименовать / обновить ссылки. Неизвестный id — состояние без изменений. */
export function updatePlaylist(
  state: PlaylistsState,
  id: string,
  patch: Partial<Pick<Playlist, "name" | "playlistUrl" | "epgUrl">>,
): PlaylistsState {
  return {
    ...state,
    items: state.items.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

/** Удалить; если удалили активный — активным становится первый оставшийся. */
export function removePlaylist(state: PlaylistsState, id: string): PlaylistsState {
  const items = state.items.filter((p) => p.id !== id);
  return {
    items,
    activeId:
      state.activeId === id ? (items[0]?.id ?? null) : state.activeId,
  };
}

/** Активный плейлист или null. */
export function activePlaylist(state: PlaylistsState): Playlist | null {
  return state.items.find((p) => p.id === state.activeId) ?? null;
}

/**
 * Upsert из GET-параметров: если плейлист с таким URL уже есть — активируем,
 * иначе добавляем (имя — по умолчанию) и активируем.
 */
export function upsertByUrl(
  state: PlaylistsState,
  playlistUrl: string,
  epgUrl: string | null,
): PlaylistsState {
  const existing = state.items.find((p) => p.playlistUrl === playlistUrl);
  if (existing) {
    return {
      items: state.items.map((p) =>
        p.id === existing.id ? { ...p, epgUrl: epgUrl ?? p.epgUrl } : p,
      ),
      activeId: existing.id,
    };
  }
  // добавляем и сразу активируем новый плейлист
  const next = addPlaylist(state, "Плейлист", playlistUrl, epgUrl);
  return { ...next, activeId: next.items[next.items.length - 1]!.id };
}
