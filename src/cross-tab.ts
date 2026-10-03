/**
 * Кросс-таб синхронизация настроек (FR-15).
 *
 * Чистая логика: решение «что делать при storage-событии из другого таба».
 * Событие срабатывает ТОЛЬКО в табах, которые не писали ключ сами, так что
 * риск эха исключён платформой. Политика — last-write-wins: состояние
 * просто перечитывается. Сравнение сыррой строки позволяет игнорировать
 * перезаписи тем же значением (не дёргать рендер зря).
 */

export interface SettingsKeyDiff {
  /** Перечитать плейлисты/активный. */
  playlists: boolean;
  /** Перечитать избранное этого плейлиста (true для любого ключа favorites). */
  favorites: boolean;
  /** Перечитать тему. */
  theme: boolean;
  /** Событие можно игнорировать целиком (чужой/служебный ключ). */
  ignore: boolean;
}

export const PLAYLISTS_STORAGE_KEY = "iptv-hub.playlists.v1";
export const ACTIVE_STORAGE_KEY = "iptv-hub.active-playlist.v1";
export const THEME_STORAGE_KEY = "iptv-hub.theme.v1";

/**
 * Классифицировать storage-событие. Значения до/после сравнивать не нужно:
 * любое внешнее изменение ключа — повод перечитать; DOM-значение не обновится,
 * только если oldValue === newValue, а такое событие браузер не посылает.
 */
export function classifyStorageChange(key: string | null): SettingsKeyDiff {
  if (key === null) {
    // key === null — clear() в другом табе: перечитываем всё.
    return { playlists: true, favorites: true, theme: true, ignore: false };
  }
  if (key === PLAYLISTS_STORAGE_KEY || key === ACTIVE_STORAGE_KEY) {
    return { playlists: true, favorites: false, theme: false, ignore: false };
  }
  if (key.startsWith("iptv-hub.favorites.v1") || key.startsWith("iptv-hub.favorites-order.v1:")) {
    return { playlists: false, favorites: true, theme: false, ignore: false };
  }
  if (key === THEME_STORAGE_KEY) {
    return { playlists: false, favorites: false, theme: true, ignore: false };
  }
  // recents, уведомления, скрытие списка и прочие «локальные» ключи —
  // перечитывать не нужно: они не портят открытый UI другого таба.
  return { playlists: false, favorites: false, theme: false, ignore: true };
}
