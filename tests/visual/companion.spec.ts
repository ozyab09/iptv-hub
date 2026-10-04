import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const TOKEN = "b".repeat(64);
const PLAYLIST = "#EXTM3U\n#EXTINF:-1,Paid HTTP\nhttp://iptv.example/live/index.m3u8\n#EXTINF:-1,Secure\nhttps://fixture.test/b.mp4\n";

/** Имитация компаньона на 127.0.0.1:47800 (CORS для сайта, как у настоящего). */
async function companion(page: Page, mode: "up" | "down") {
  const proxied: string[] = [];
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  await page.route("http://127.0.0.1:47800/**", (route) => {
    if (mode === "down") return route.abort("connectionrefused");
    const url = new URL(route.request().url());
    const headers = { "Access-Control-Allow-Origin": new URL(page.url()).origin };
    if (url.pathname === "/health") return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify({ app: "iptv-hub-companion", version: "0.3.0", protocol: 1 }) });
    if (url.pathname === "/pair") return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify({ token: TOKEN, proxyBase: `http://127.0.0.1:47800/proxy/${TOKEN}`, protocol: 1 }) });
    proxied.push(url.pathname);
    if (url.pathname.endsWith("index.m3u8")) {
      return route.fulfill({ headers, contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nhttp://127.0.0.1:47800/proxy/${TOKEN}/http/iptv.example/live/seg.ts\n#EXT-X-ENDLIST\n` });
    }
    return route.fulfill({ headers, contentType: "video/mp2t", body: ts });
  });
  return proxied;
}

async function setup(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://fixture.test/**", (route) => route.request().url().endsWith("playlist.m3u")
    ? route.fulfill({ body: PLAYLIST }) : route.fulfill({ status: 404 }));
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "c", name: "Paid", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "c");
  });
}

const nav = (page: Page, name: string) => page.locator("#side-nav button").filter({ hasText: name }).first();

// #465: с подключённым компаньоном http-каналы видны и играют через 127.0.0.1.
test("enabling the companion reveals and plays http channels through 127.0.0.1", async ({ page }) => {
  await setup(page);
  const proxied = await companion(page, "up");
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);

  await nav(page, "Settings").click();
  await expect(page.locator("#companion-settings")).toBeVisible();
  await expect(page.locator("#companion-status")).toContainText("Off");
  await expect(page.locator(".companion-download").first()).toHaveAttribute("href", /releases\/latest\/download\/iptv-hub-companion-/);
  await page.locator("#companion-settings .player-switch").click();
  await expect(page.locator("#companion-status")).toHaveText("Connected (version 0.3.0): http channels are available.");

  await nav(page, "Channels").click();
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
  await page.locator("#channel-list .channel-card").filter({ hasText: "Paid HTTP" }).click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  expect(proxied).toContain(`/proxy/${TOKEN}/http/iptv.example/live/index.m3u8`);
  expect(proxied).toContain(`/proxy/${TOKEN}/http/iptv.example/live/seg.ts`);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recents.v1:c") ?? "[]"))).toEqual(["http://iptv.example/live/index.m3u8"]);
});

test("tray link ?companion=1 enables the mode; an absent companion keeps the web behaviour", async ({ page }) => {
  await setup(page);
  await companion(page, "down");
  await page.goto("/?companion=1");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  expect(await page.evaluate(() => location.search)).toBe("");
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.companion.v1"))).toBe(JSON.stringify({ enabled: true }));
  await nav(page, "Settings").click();
  await expect(page.locator("#companion-status")).toContainText("not responding");
  await expect(page.locator("#companion-retry")).toBeVisible();
  await expect(page.locator("#companion-enabled")).toBeChecked();
});
