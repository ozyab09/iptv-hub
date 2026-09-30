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

/**
 * Смешанный контент: https-страница не может фетчить http:// URL —
 * браузер блокирует запрос ещё до сети (снаружи выглядит как NetworkError).
 * Проверяем заранее, чтобы дать понятную ошибку вместо загадочной.
 */
export function isMixedContent(pageUrl: string, targetUrl: string): boolean {
  try {
    return (
      new URL(pageUrl).protocol === "https:" &&
      new URL(targetUrl).protocol === "http:"
    );
  } catch {
    return false;
  }
}

/**
 * Локальный или приватный хост: localhost, *.local, loopback и RFC1918-сети.
 * Общий предикат для httpToHttps (player.ts) и фильтра http-каналов (m3u.ts):
 * у таких хостов TLS на 443 обычно не поднят, зато mixed content с них
 * браузер прощает — http-канал домашнего IPTV-сервера на https-странице
 * играет, и прятать его из списка не нужно.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}
