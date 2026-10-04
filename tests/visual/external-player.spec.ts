import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function setup(page: Page, bridge: boolean) {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Мусорные TS-сегменты: нечинящаяся ошибка декодирования быстро доходит до фатального состояния.
  const garbage = Buffer.alloc(188 * 200, 0x47);
  for (let i = 0; i < garbage.length; i += 188) garbage.fill(0xff, i + 1, i + 188);
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Broken\nhttps://fixture.test/broken.m3u8\n" });
    if (url.endsWith(".m3u8")) {
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n" + Array.from({ length: 10 }, (_, i) => `#EXTINF:4,\ns${i}.ts\n`).join("") + "#EXT-X-ENDLIST\n" });
    }
    return route.fulfill({ body: garbage, contentType: "video/mp2t" });
  });
  await page.addInitScript((withBridge) => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "ext", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "ext");
    const sent: string[] = [];
    (window as unknown as { sent: string[] }).sent = sent;
    if (withBridge) (window as unknown as { IPTVHubExternalPlayer: unknown }).IPTVHubExternalPlayer = { postMessage: (m: string) => sent.push(m) };
  }, bridge);
  await page.goto("/");
}

// #372: в браузере — копирование ссылки на поток, в приложении — внешний плеер.
test("fatal stream offers the stream link; channel editor copies it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page, false);
  await page.locator("#channel-list .channel-card").click();
  const out = page.locator("#btn-stream-out");
  await expect(page.locator("#btn-retry")).toBeVisible({ timeout: 20_000 });
  await expect(out).toBeVisible();
  await expect(out).toHaveAttribute("aria-label", "Copy stream link");
  await out.click();
  await expect(page.locator("#toast")).toHaveText("Stream link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://fixture.test/broken.m3u8");

  await page.locator("#btn-close-player").click();
  await page.locator("#channel-list [data-channel-edit]").click();
  await expect(page.locator("#channel-external")).toBeHidden();
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.locator("#channel-copy-stream").click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("https://fixture.test/broken.m3u8");
});

test("Android app bridge opens the stream in an external player", async ({ page }) => {
  await setup(page, true);
  await page.locator("#channel-list [data-channel-edit]").click();
  await expect(page.locator("#channel-external")).toBeVisible();
  await page.locator("#channel-external").click();
  await expect(page.locator("#toast")).toHaveText("Choose a player such as VLC or MX Player");
  expect(await page.evaluate(() => (window as unknown as { sent: string[] }).sent)).toEqual(["https://fixture.test/broken.m3u8"]);

  await page.locator("#channel-editor-cancel").click();
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#btn-stream-out")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#btn-stream-out")).toHaveAttribute("aria-label", "Open in external player");
  await page.locator("#btn-stream-out").click();
  expect(await page.evaluate(() => (window as unknown as { sent: string[] }).sent)).toHaveLength(2);
});
