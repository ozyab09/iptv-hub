import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json" };

// #452: внутри Android-приложения (origin appassets.androidplatform.net) http-канал
// публичного хоста не скрывается и играет через /proxy/ того же origin.
test("app origin keeps public http channels and plays them through /proxy/", async ({ page }) => {
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  const proxied: string[] = [];
  await page.route("https://appassets.androidplatform.net/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/proxy/")) {
      proxied.push(url.pathname);
      // Имитация MainActivity/AppProxy: HLS переписан на /proxy/, остальное — как у провайдера.
      if (url.pathname.endsWith("playlist.m3u")) return route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Paid HTTP\nhttp://iptv.example/live/index.m3u8\n#EXTINF:-1,Secure\nhttps://cdn.example/b.m3u8\n" });
      if (url.pathname.endsWith("index.m3u8")) {
        return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nhttps://appassets.androidplatform.net/proxy/http/iptv.example/live/seg.ts\n#EXT-X-ENDLIST\n" });
      }
      return route.fulfill({ contentType: "video/mp2t", body: ts });
    }
    const file = join("dist", url.pathname.replace(/^\/www\/?/, "/") === "/" ? "index.html" : url.pathname.replace(/^\/www\//, ""));
    if (!existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? "application/octet-stream" });
  });
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "app", name: "Paid", playlistUrl: "http://iptv.example/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "app");
  });
  await page.goto("https://appassets.androidplatform.net/www/index.html");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
  expect(proxied).toContain("/proxy/http/iptv.example/playlist.m3u");

  await page.locator("#channel-list .channel-card").filter({ hasText: "Paid HTTP" }).click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  expect(proxied).toContain("/proxy/http/iptv.example/live/index.m3u8");
  expect(proxied).toContain("/proxy/http/iptv.example/live/seg.ts");
  // Идентичность канала — исходный URL (избранное, недавние).
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recents.v1:app") ?? "[]"))).toEqual(["http://iptv.example/live/index.m3u8"]);
});

test("web version still hides public http channels", async ({ page }) => {
  await page.route("https://fixture.test/**", (route) => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Paid HTTP\nhttp://iptv.example/live/index.m3u8\n#EXTINF:-1,Secure\nhttps://cdn.example/b.m3u8\n" }));
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "web", name: "Web", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "web");
  });
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await expect(page.locator("#channel-list .channel-card")).toContainText("Secure");
});
