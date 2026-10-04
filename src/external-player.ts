/**
 * Поток во внешнем плеере и копирование ссылки (#372).
 *
 * Часть каналов браузер играть не может (CORS, MSE, кодеки — см. «Известные
 * ограничения»). Без бэкенда выход один: отдать ссылку дальше. В Android-
 * приложении — системный выбор плеера (VLC, MX Player, mpv) через мост
 * IPTVHubExternalPlayer; в браузере — копирование URL в буфер обмена.
 * Чистый модуль: окно, буфер обмена и документ инъецируются.
 */

/** Схемы, которые имеет смысл отдавать видеоплееру. */
const PLAYABLE = /^(https?|rtmps?|rtsp|rtp|udp|mms):\/\//i;

export function isExternalPlayable(url: string): boolean {
  return PLAYABLE.test(url.trim());
}

/**
 * Ссылка текущего источника: из архива — catchup-URL, иначе исходный URL
 * канала (до https-апгрейда и зеркал).
 */
export function streamLink(channelUrl: string | null, archiveUrl: string | null): string | null {
  const url = archiveUrl ?? channelUrl;
  return url && isExternalPlayable(url) ? url : null;
}

/** Мост Android-приложения (WebViewCompat.addWebMessageListener). */
export interface ExternalPlayerBridge {
  postMessage(message: string): void;
}

/** Мост есть только в приложении: WebView добавляет объект для своего origin. */
export function externalPlayerBridge(win: object): ExternalPlayerBridge | null {
  const bridge = (win as { IPTVHubExternalPlayer?: Partial<ExternalPlayerBridge> }).IPTVHubExternalPlayer;
  return bridge && typeof bridge.postMessage === "function" ? (bridge as ExternalPlayerBridge) : null;
}

/** Открыть ссылку во внешнем плеере; false — моста нет или ссылка не для плеера. */
export function openExternally(bridge: ExternalPlayerBridge | null, url: string): boolean {
  if (!bridge || !isExternalPlayable(url)) return false;
  bridge.postMessage(url);
  return true;
}

export interface CopyDeps {
  clipboard?: { writeText(text: string): Promise<void> } | null;
  /** Запасной путь без Clipboard API (http-страница, старый WebView). */
  fallback?: (text: string) => boolean;
}

/** Скопировать текст: Clipboard API, иначе запасной путь. Никогда не бросает. */
export async function copyText(text: string, deps: CopyDeps): Promise<boolean> {
  try {
    if (deps.clipboard) {
      await deps.clipboard.writeText(text);
      return true;
    }
  } catch {
    // нет разрешения или фокуса — пробуем запасной путь
  }
  try {
    return deps.fallback?.(text) ?? false;
  } catch {
    return false;
  }
}

/** Запасное копирование через выделение textarea (document.execCommand). */
export function selectionCopy(doc: Document): (text: string) => boolean {
  return (text) => {
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.append(area);
    area.select();
    try {
      return doc.execCommand("copy");
    } finally {
      area.remove();
    }
  };
}
