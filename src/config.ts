/** Разбор URL-параметров приложения. Только http(s). */
export interface AppConfig {
  playlistUrl: string;
  epgUrl: string | null;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Источник конфигурации (приоритет):
 *   1. GET-параметры: ?p=<плейлист>&e=<epg>
 *   2. localStorage (сохранённая настройка)
 * Возвращает null, если валидного плейлист-URL нет нигде.
 */
export function resolveConfig(
  search: string,
  storage: Storage | null,
): AppConfig | null {
  const params = new URLSearchParams(search);
  const p = params.get("p")?.trim() ?? "";
  const e = params.get("e")?.trim() ?? "";

  if (p && isHttpUrl(p)) {
    const cfg: AppConfig = { playlistUrl: p, epgUrl: e && isHttpUrl(e) ? e : null };
    saveConfig(cfg, storage); // помним последний источник
    return cfg;
  }

  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AppConfig>;
        if (saved.playlistUrl && isHttpUrl(saved.playlistUrl)) {
          return {
            playlistUrl: saved.playlistUrl,
            epgUrl:
              saved.epgUrl && isHttpUrl(saved.epgUrl) ? saved.epgUrl : null,
          };
        }
      }
    } catch {
      // битый localStorage — игнорируем, покажем setup-экран
    }
  }
  return null;
}

/** Сохранить конфиг в localStorage (best-effort, может быть заблокирован). */
export function saveConfig(cfg: AppConfig, storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // private mode / quota — молча живём без персистентности
  }
}

export const STORAGE_KEY = "iptv-hub.config.v1";
