/**
 * Service Worker IPTV Hub.
 *
 * Стратегии:
 *  - app shell (прекеш статики): cache-first → сеть, оффлайн отдаётся из кэша;
 *  - навигации: network-first мимо HTTP-кэша (cache: "no-cache") с fallback
 *    на закешированный index.html — иначе Pages отдавал бы старую страницу
 *    ещё до 10 минут после деплоя;
 *  - плейлист/EPG (кросс-доменные S3-запросы): network-first с кэш-fallback —
 *    оффлайн показываем последнюю успешную копию.
 *
 * Медиа-потоки (hls.js сегменты, .ts/.m3u8) НЕ кешируются осознанно:
 * живой телевизор в оффлайне не существует, а кеш сегментов раздувает storage.
 */
// При сборке к версии дописывается хэш index.html (vite.config.ts →
// src/sw-version.ts), поэтому каждый деплой — новый SW и новый кэш.
const VERSION = "v0.2.44";
const SHELL_CACHE = `iptv-hub-shell-${VERSION}`;
const DATA_CACHE = `iptv-hub-data-${VERSION}`;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-180.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isShellRequest(url) {
  return url.origin === self.location.origin;
}

/** Кросс-доменные данные (плейлист/EPG с S3) — network-first, fallback в кэш. */
async function networkFirstData(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const resp = await fetch(request);
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: "offline и в кэше копии нет" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

/** Навигация — network-first, при оффлайне — index.html из shell-кэша. */
async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // no-cache: браузер обязан сверить страницу с сервером (по ETag это
    // дёшево), а не взять из HTTP-кэша копию прошлого деплоя
    const resp = await fetch(request.url, { cache: "no-cache", credentials: "same-origin" });
    if (resp.ok) cache.put("./index.html", resp.clone());
    return resp;
  } catch {
    return (await cache.match("./index.html")) ?? Response.error();
  }
}

/** Статика shell — cache-first (версия в имени кэша решает инвалидацию). */
async function cacheFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const resp = await fetch(request);
  if (resp.ok && isShellRequest(new URL(request.url))) {
    cache.put(request, resp.clone());
  }
  return resp;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // только GET, только http(s); media-потоки и range-запросы мимо кэша
  if (event.request.method !== "GET") return;
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  if (event.request.headers.has("range")) return;
  if (/\.(ts|m4s|mp4|aac)(\?|$)/i.test(url.pathname)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  if (isShellRequest(url)) {
    event.respondWith(cacheFirstShell(event.request));
    return;
  }
  // кросс-доменные GET: плейлист, EPG, логотипы
  event.respondWith(networkFirstData(event.request));
});
