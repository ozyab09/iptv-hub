/**
 * Локальный прокси для http-источников (#452). Не серверный — работает на
 * устройстве пользователя, внешних сервисов нет:
 *
 * - Android-приложение: запросы `https://appassets.androidplatform.net/proxy/
 *   <scheme>/<authority>/<path>` перехватывает MainActivity — тот же origin,
 *   ни mixed content, ни CORS;
 * - десктоп: сопряжённый компаньон на http://127.0.0.1:47800 (#465).
 *
 * Без них (GitHub Pages в обычном браузере) функции возвращают исходный URL.
 */
import { isPrivateHost } from "./config";
import { companionProxyUrl, type CompanionPairing } from "./companion";

/** Локальный origin Android-приложения (WebViewAssetLoader). */
export const APP_HOST = "appassets.androidplatform.net";
export const APP_PROXY_PATH = "/proxy/";

let companion: CompanionPairing | null = null;

/** Сопряжение с компаньоном (null — отключён или не отвечает). */
export function setCompanionPairing(pairing: CompanionPairing | null): void {
  companion = pairing;
}

/** Страница открыта внутри Android-приложения. */
export function isAppPage(pageUrl: string): boolean {
  try {
    const page = new URL(pageUrl);
    return page.protocol === "https:" && page.hostname === APP_HOST;
  } catch {
    return false;
  }
}

/** Есть ли локальный прокси: приложение или сопряжённый компаньон. */
export function hasLocalProxy(pageUrl: string): boolean {
  return isAppPage(pageUrl) || companion !== null;
}

/**
 * Прокси-адрес для http-ресурса публичного хоста или null: прокси нет, URL
 * не http или адрес локальный/приватный (его и так грузят напрямую).
 */
export function localProxyUrl(url: string, pageUrl: string): string | null {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== "http:" || isPrivateHost(target.hostname)) return null;
  if (isAppPage(pageUrl)) return `https://${APP_HOST}${APP_PROXY_PATH}http/${target.host}${target.pathname}${target.search}`;
  return companion ? companionProxyUrl(target, companion) : null;
}

/** URL для загрузки: через локальный прокси, если он нужен, иначе исходный. */
export function viaLocalProxy(url: string, pageUrl: string): string {
  return localProxyUrl(url, pageUrl) ?? url;
}

/**
 * Прокси-адрес для загрузки данных (плейлист, EPG, API Xtream): как
 * localProxyUrl, но с сопряжённым компаньоном через него идут и https-URL —
 * провайдер может не отдавать CORS-заголовки, а браузер без них не может
 * прочитать ответ; компаньон ставит их сам. Потоки https остаются прямыми:
 * если CDN отдаёт CORS, прокси не нужен, а гнать все сегменты через 127.0.0.1
 * нет смысла. В Android-приложении https остаётся прямым — его прокси решает
 * только задачу http-источников (#452).
 */
export function localDataProxyUrl(url: string, pageUrl: string): string | null {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (isPrivateHost(target.hostname)) return null;
  if (target.protocol === "https:") return companion ? companionProxyUrl(target, companion) : null;
  return localProxyUrl(url, pageUrl);
}

/** URL для загрузки данных: через прокси, если он нужен, иначе исходный. */
export function viaDataProxy(url: string, pageUrl: string): string {
  return localDataProxyUrl(url, pageUrl) ?? url;
}
