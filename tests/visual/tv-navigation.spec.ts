import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block", viewport: { width: 1920, height: 1080 } });
async function tabTo(page: Page, selector: string, reverse = false): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(selector => document.activeElement?.matches(selector), selector)) return;
    await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
  }
  await expect(page.locator(selector)).toBeFocused();
}

test("TV virtual-list focus survives delayed EPG and navigation past rendered rows", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://fixture.test/playlist.m3u", route => route.fulfill({ body: "#EXTM3U\n" + Array.from({ length: 500 }, (_, i) => `#EXTINF:-1 tvg-id="${i}",Channel ${String(i).padStart(3, "0")}\nhttps://fixture.test/${i}.mp4`).join("\n") }));
  await page.route("https://fixture.test/epg.xml", async route => {
    await pending;
    await route.fulfill({ body: "<tv></tv>" });
  });
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  });
  await page.goto("/?tv=1");
  await expect(page.locator("#channel-list .channel-hit").first()).toBeVisible();
  await tabTo(page, "#search", true);
  await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 100; i++) await page.keyboard.press("ArrowDown");
  const selected = page.locator('[data-result-index="100"] .channel-hit');
  await expect(selected).toBeFocused();
  const epg = page.waitForResponse("https://fixture.test/epg.xml");
  release(); await epg;
  await expect(page.locator("#epg-now")).toBeHidden();
  await expect(selected).toBeFocused();
  expect(await page.locator("#channel-list .channel-card").count()).toBeLessThan(40);
});

for (const theme of ["dark", "light"]) {
  test(`TV keyboard path: channel, pause, guide, back and menus (${theme})`, async ({ page }) => {
    const segment = readFileSync("tests/fixtures/recording.mpegts");
    const date = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
    const now = Date.now();
    await page.route("https://fixture.test/**", route => {
      const url = route.request().url();
      if (url.endsWith("playlist.m3u")) return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="News",Alpha\nhttps://fixture.test/a/live.m3u8\n#EXTINF:-1 tvg-id="b" group-title="News",Beta\nhttps://fixture.test/b/live.m3u8' });
      if (url.endsWith("epg.xml")) return route.fulfill({ body: `<tv>${["a", "b"].map(id => `<programme channel="${id}" start="${date(now - 600000)}" stop="${date(now + 3600000)}"><title>Current programme</title></programme><programme channel="${id}" start="${date(now + 3600000)}" stop="${date(now + 7200000)}"><title>Next programme</title></programme>`).join("")}</tv>` });
      if (url.endsWith(".ts")) return route.fulfill({ body: segment, contentType: "video/mp2t" });
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-TARGETDURATION:4\n${Array.from({ length: 20 }, (_, i) => `#EXT-X-DISCONTINUITY\n#EXTINF:4,\n${i}.ts`).join("\n")}\n#EXT-X-ENDLIST` });
    });
    await page.addInitScript(theme => {
      localStorage.setItem("iptv-hub.theme.v1", theme);
      localStorage.setItem("iptv-hub.language.v1", "en");
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    }, theme);
    await page.goto("/?tv=1");
    await expect(page.locator("html")).toHaveAttribute("data-tv", "true");
    await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
    await tabTo(page, "#search");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-result-index="0"] .channel-hit')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-result-index="1"] .channel-hit')).toBeFocused();
    await expect(page.locator('[data-result-index="1"] .channel-hit')).toHaveCSS("outline-width", "4px");
    await page.keyboard.press("Enter");
    await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
    await expect(page.locator("#now-title")).toHaveText("Beta");
    await tabTo(page, "#btn-pause");
    await page.keyboard.press("Enter");
    await expect(page.locator("#video")).toHaveJSProperty("paused", true);
    await expect(page.locator(".tv-paused-info")).toBeVisible();
    await expect(page.locator(".tv-paused-info")).toContainText("Now: Current programme");
    await expect(page.locator(".tv-paused-info")).toContainText("Next: Next programme");
    await page.screenshot({ path: `test-results/tv-pause-${theme}.png` });
    await tabTo(page, "#sched-list .programme-info");
    await page.keyboard.press("Enter");
    await expect(page.locator("#programme-overlay")).toBeVisible();
    await expect(page.locator("#programme-card-close")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#programme-overlay")).toBeHidden();
    await expect(page.locator("#sched-list .programme-info").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#player-bar")).toBeHidden();
    await expect(page.locator(".tv-paused-info")).toBeHidden();
    await expect(page.locator('[data-result-index="1"] .channel-hit')).toBeFocused();
    await tabTo(page, "#pl-switch-btn");
    await page.keyboard.press("Enter");
    await expect(page.locator("#pl-switch-menu")).toBeVisible();
    await expect(page.locator("#pl-switch-menu button").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#pl-switch-menu")).toBeHidden();
    await expect(page.locator("#pl-switch-btn")).toBeFocused();
  });
}
