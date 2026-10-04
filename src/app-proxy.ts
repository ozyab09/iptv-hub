/**
 * Прокси внутри Android-приложения (#452). Не серверный: запросы
 * `https://appassets.androidplatform.net/proxy/<scheme>/<authority>/<path>`
 * перехватывает MainActivity и сам загружает исходный ресурс. Для страницы
 * это тот же origin — ни mixed content, ни CORS. На GitHub Pages и в
 * обычном браузере перехватчика нет: функции возвращают исходный URL.
 */
import { isPrivateHost } from "./config";

/** Локальный origin Android-приложения (WebViewAssetLoader). */
export const APP_HOST = "appassets.androidplatform.net";
export const APP_PROXY_PATH = "/proxy/";

/** Страница открыта внутри Android-приложения. */
export function isAppPage(pageUrl: string): boolean {
  try {
    const page = new URL(pageUrl);
    return page.protocol === "https:" && page.hostname === APP_HOST;
  } catch {
    return false;
  }
}

/**
 * Прокси-адрес для http-ресурса публичного хоста или null: страница не в
 * приложении, URL не http, адрес локальный/приватный (его WebView и так
 * загрузит как раньше) или уже проксирован.
 */
export function appProxyUrl(url: string, pageUrl: string): string | null {
  if (!isAppPage(pageUrl)) return null;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== "http:" || isPrivateHost(target.hostname)) return null;
  return `https://${APP_HOST}${APP_PROXY_PATH}http/${target.host}${target.pathname}${target.search}`;
}

/** URL для загрузки: через прокси приложения, если он нужен, иначе исходный. */
export function viaAppProxy(url: string, pageUrl: string): string {
  return appProxyUrl(url, pageUrl) ?? url;
}
