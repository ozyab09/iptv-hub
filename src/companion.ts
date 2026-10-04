/**
 * Компаньон для десктопа (#452, #465): сайт на GitHub Pages обращается к
 * локальной программе на http://127.0.0.1:47800. Loopback браузеры считают
 * безопасным адресом, поэтому http-плейлисты и потоки, загруженные
 * компаньоном, не блокируются как mixed content, а CORS ставит он сам.
 * Чистый модуль: сеть и хранилище инъецируются.
 */

export const COMPANION_PORT = 47800;
export const COMPANION_ORIGIN = `http://127.0.0.1:${COMPANION_PORT}`;
/** Версия контракта с компаньоном (поле protocol в /health и /pair). */
export const COMPANION_PROTOCOL = 1;
export const COMPANION_KEY = "iptv-hub.companion.v1";
/** Дольше не ждём: без компаньона запуск сайта не должен тормозить. */
export const COMPANION_TIMEOUT_MS = 2500;

/** Сопряжение: токен и префикс прокси-адресов. */
export interface CompanionPairing {
  token: string;
  proxyBase: string;
  version: string;
}

export type CompanionStatus =
  | { state: "off" }
  | { state: "connected"; pairing: CompanionPairing }
  /** Не отвечает: не установлен, не запущен или браузер не дал доступ к локальной сети. */
  | { state: "unavailable" }
  /** Отвечает, но версия протокола другая — нужно обновить компаньон. */
  | { state: "outdated"; version: string };

/** Включён ли режим компаньона (opt-in: запрос Chrome о локальной сети видят только желающие). */
export function loadCompanionEnabled(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return JSON.parse(storage?.getItem(COMPANION_KEY) ?? "null")?.enabled === true;
  } catch {
    return false;
  }
}

export function saveCompanionEnabled(storage: Pick<Storage, "setItem"> | null, enabled: boolean): void {
  try {
    storage?.setItem(COMPANION_KEY, JSON.stringify({ enabled }));
  } catch {
    /* приватный режим — настройка живёт до перезагрузки */
  }
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** /health → /pair. Любая ошибка, таймаут или чужой ответ — «недоступен». */
export async function connectCompanion(fetcher: Fetch, timeoutMs = COMPANION_TIMEOUT_MS): Promise<CompanionStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const health = await (await fetcher(`${COMPANION_ORIGIN}/health`, { signal: controller.signal })).json() as Record<string, unknown>;
    if (health.app !== "iptv-hub-companion") return { state: "unavailable" };
    const version = typeof health.version === "string" ? health.version : "?";
    if (health.protocol !== COMPANION_PROTOCOL) return { state: "outdated", version };
    const pair = await (await fetcher(`${COMPANION_ORIGIN}/pair`, { signal: controller.signal })).json() as Record<string, unknown>;
    const expectedBase = `${COMPANION_ORIGIN}/proxy/${String(pair.token)}`;
    if (typeof pair.token !== "string" || !/^[0-9a-f]{32,}$/.test(pair.token) || pair.proxyBase !== expectedBase) {
      return { state: "unavailable" };
    }
    return { state: "connected", pairing: { token: pair.token, proxyBase: expectedBase, version } };
  } catch {
    return { state: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Прокси-адрес компаньона для http(s)-ресурса; host уже проверен вызывающим. */
export function companionProxyUrl(target: URL, pairing: CompanionPairing): string {
  const scheme = target.protocol === "https:" ? "https" : "http";
  return `${pairing.proxyBase}/${scheme}/${target.host}${target.pathname}${target.search}`;
}

/** Ссылка из трея: `?companion=1` включает режим; параметр убирается из адреса. */
export function takeCompanionParam(search: string): { enable: boolean; search: string } {
  const params = new URLSearchParams(search);
  if (params.get("companion") !== "1") return { enable: false, search };
  params.delete("companion");
  const next = params.toString();
  return { enable: true, search: next ? `?${next}` : "" };
}

export type CompanionPlatform = "windows" | "macos" | "linux" | "other";

/** ОС посетителя — чтобы первой показать нужную ссылку на скачивание. */
export function detectPlatform(userAgent: string, platform = ""): CompanionPlatform {
  const ua = `${userAgent} ${platform}`.toLowerCase();
  if (/android|iphone|ipad|cros/.test(ua)) return "other";
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "other";
}

const RELEASES = "https://github.com/ozyab09/iptv-hub/releases/latest/download";

/** Ссылки на бинарники последнего релиза (имена стабильны, #464). */
export const COMPANION_DOWNLOADS: readonly { platform: Exclude<CompanionPlatform, "other">; label: string; url: string }[] = [
  { platform: "windows", label: "Windows x64", url: `${RELEASES}/iptv-hub-companion-windows-amd64.exe` },
  { platform: "windows", label: "Windows ARM64", url: `${RELEASES}/iptv-hub-companion-windows-arm64.exe` },
  { platform: "macos", label: "macOS Apple Silicon", url: `${RELEASES}/iptv-hub-companion-macos-arm64.tar.gz` },
  { platform: "macos", label: "macOS Intel", url: `${RELEASES}/iptv-hub-companion-macos-amd64.tar.gz` },
  { platform: "linux", label: "Linux x64", url: `${RELEASES}/iptv-hub-companion-linux-amd64.tar.gz` },
  { platform: "linux", label: "Linux ARM64", url: `${RELEASES}/iptv-hub-companion-linux-arm64.tar.gz` },
];
