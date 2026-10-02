import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`Xtream live, EPG, catchup and editing (${width}, ${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => {
        localStorage.setItem("iptv-hub.theme.v1", theme);
        localStorage.setItem("iptv-hub.language.v1", "en");
      }, theme);
      const date = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
      const now = Date.now();
      const xml = `<tv><programme channel="news" start="${date(now - 3600000)}" stop="${date(now - 1800000)}"><title>Archive fixture</title></programme><programme channel="news" start="${date(now - 1800000)}" stop="${date(now + 3600000)}"><title>Live fixture</title></programme></tv>`;
      const segment = readFileSync("tests/fixtures/recording.mpegts");
      const requests: string[] = [];
      await page.route("https://provider.test/**", (route) => {
        const url = new URL(route.request().url());
        requests.push(url.href);
        if (url.pathname.endsWith("player_api.php")) return route.fulfill({ json: url.searchParams.get("action") === "get_live_categories"
          ? [{ category_id: "1", category_name: "News" }]
          : [{ stream_id: 42, name: "News HD", category_id: "1", epg_channel_id: "news", tv_archive: 1, tv_archive_duration: 2 }] });
        if (url.pathname.endsWith("xmltv.php")) return route.fulfill({ body: xml });
        if (url.pathname.endsWith(".ts")) return route.fulfill({ body: segment, contentType: "video/mp2t" });
        return route.fulfill({ body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4,\none.ts\n#EXT-X-ENDLIST\n", contentType: "application/vnd.apple.mpegurl" });
      });
      await page.goto("/");
      await page.getByRole("radio", { name: "Xtream Codes", exact: true }).click();
      await expect(page.locator("#m3u-fields")).toBeHidden();
      await expect(page.locator("#xtream-fields .set-note")).toBeVisible();
      await page.locator("#xtream-host").fill("http://provider.test");
      await page.locator("#xtream-user").fill("user");
      await page.locator("#xtream-password").fill("secret");
      await page.locator("#setup-load").click();
      await expect(page.locator("#setup-error")).toContainText("HTTPS");
      expect(requests).toEqual([]);
      await page.locator("#xtream-host").fill("https://provider.test");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath("xtream-form.png") });
      await page.locator("#setup-load").click();
      const row = page.locator("#channel-list .channel-card").first();
      await expect(row).toContainText("News HD");
      await expect(row).toContainText("Live fixture");
      await row.click();
      await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
      if (width < 1024) await page.locator("#player-bar").click();
      await page.locator("#btn-guide").click();
      await page.locator("#guide-list .prog-row").filter({ hasText: "Archive fixture" }).click({ timeout: 5000 });
      await expect.poll(() => requests.find((url) => url.includes("/timeshift/") && url.endsWith(".m3u8"))).toBeTruthy();
      const archive = new URL(requests.find((url) => url.includes("/timeshift/") && url.endsWith(".m3u8"))!);
      expect(archive.pathname).toMatch(/^\/timeshift\/user\/secret\/30\/\d{4}-\d{2}-\d{2}:\d{2}-\d{2}\/42.m3u8$/);
      await expect(page.locator("#now-title")).toContainText("архив");
      await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
      await page.locator("#btn-close-player").click();
      await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
      await page.locator(".pl-act:not(.pl-del)").first().click();
      await expect(page.locator('.pl-edit input[type="password"]')).toHaveValue("secret");
      await page.locator('.pl-edit input[type="password"]').fill("updated");
      await page.locator('.pl-edit button[type="submit"]').click();
      await expect(row).toContainText("News HD");
      await expect.poll(() => requests.some((url) => new URL(url).searchParams.get("password") === "updated")).toBe(true);
      await page.reload();
      await expect(row).toContainText("Live fixture");
      expect(requests.every((url) => url.startsWith("https://"))).toBe(true);
    });
  }
}

test("M3U query upsert preserves Xtream and backup credentials", async ({ page }) => {
  const xtreamUrl = "https://provider.test/player_api.php?username=user&password=secret&action=get_live_streams";
  await page.addInitScript((xtreamUrl) => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "xc", name: "Xtream", playlistUrl: xtreamUrl, epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "xc");
  }, xtreamUrl);
  await page.route("https://fixture.test/list.m3u", (route) => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Ordinary\nhttps://fixture.test/live.mp4\n" }));
  await page.goto("/?p=" + encodeURIComponent("https://fixture.test/list.m3u"));
  await expect(page.locator("#channel-list .channel-card")).toContainText("Ordinary");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.playlists.v1")!).length)).toBe(2);
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#btn-export").click();
  const download = await downloadPromise;
  const backup = JSON.parse(readFileSync((await download.path())!, "utf8")) as { playlists: { playlistUrl: string }[] };
  expect(backup.playlists.some((p) => p.playlistUrl === xtreamUrl)).toBe(true);
  await page.locator("#import-file").setInputFiles((await download.path())!);
  await expect(page.locator("#channel-list .channel-card")).toContainText("Ordinary");
});
