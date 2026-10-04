import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const other = "Other extremely long channel category that wraps on mobile";

async function navigate(page: Page, name: string): Promise<void> {
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first().click();
}

async function setup(page: Page, width: number, theme: string, segmentReady?: Promise<void>): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  const media = readFileSync("tests/fixtures/recording.mp4");
  const date = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const now = Date.now();
  await page.route("https://fixture.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith(".m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nfirst.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\nsecond.ts\n#EXT-X-ENDLIST\n" });
    if (url.endsWith("second.ts")) await segmentReady;
    if (url.endsWith(".ts")) return route.fulfill({ body: readFileSync("tests/fixtures/recording.mpegts"), contentType: "video/mp2t" });
    if (url.endsWith(".mp4")) return route.fulfill({ contentType: "video/mp4", body: media });
    if (url.endsWith(".xml")) return route.fulfill({ body: `<tv><channel id="a"><display-name>Alpha</display-name></channel><programme channel="a" start="${date(now - 60000)}" stop="${date(now + 3600000)}"><title>News bulletin</title></programme><programme channel="a" start="${date(now + 3600000)}" stop="${date(now + 7200000)}"><title>Next bulletin</title></programme></tv>` });
    return route.fulfill({ body: `#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="News",Alpha\nhttps://fixture.test/a.${segmentReady ? "m3u8" : "mp4"}\n#EXTINF:-1 group-title="Sports",Beta\nhttps://fixture.test/b.mp4\n#EXTINF:-1 group-title="${other}",Gamma\nhttps://fixture.test/c.mp4\n` });
  });
  await page.addInitScript((theme) => {
    if (localStorage.getItem("iptv-hub.playlists.v1")) return;
    localStorage.setItem("iptv-hub.theme.v1", theme);
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify(["one", "two"].map((id) => ({ id, name: id, playlistUrl: `https://fixture.test/${id}.m3u`, epgUrl: "https://fixture.test/epg.xml" }))));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    localStorage.setItem("iptv-hub.favorites.v1:one", JSON.stringify(["https://fixture.test/a.mp4", "https://fixture.test/b.mp4"]));
    localStorage.setItem("iptv-hub.recents.v1:one", JSON.stringify(["https://fixture.test/a.mp4", "https://fixture.test/b.mp4"]));
  }, theme);
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card").filter({ hasText: "Alpha" })).toContainText("News bulletin");
}

for (const width of [320, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`hide, reorder, reload, restore and playlist isolation (${width}, ${theme})`, async ({ page }, testInfo) => {
      await setup(page, width, theme);
      await page.locator('#channel-list [data-channel-url="https://fixture.test/a.mp4"]').click();
      await navigate(page, "Settings");
      const groups = page.locator("#group-preferences");
      const names = () => groups.locator(".item-label").allTextContents();
      expect(await names()).toEqual(["News", other, "Sports"]);
      await groups.getByRole("button", { name: "Move Sports up", exact: true }).click();
      await groups.getByRole("button", { name: "Move Sports up", exact: true }).click();
      expect(await names()).toEqual(["Sports", "News", other]);
      await expect(groups.getByRole("checkbox", { name: "Show Sports", exact: true })).toBeFocused();
      await expect(page.locator("#player-bar")).toBeVisible();
      await groups.getByRole("checkbox", { name: "Show News", exact: true }).uncheck();
      await expect(page.locator("#player-bar")).toBeHidden();
      await expect(groups.getByRole("checkbox", { name: "Show News", exact: true })).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath("groups.png") });
      for (const row of await groups.locator(".group-preference").all()) {
        const bounds = await row.boundingBox();
        for (const button of await row.locator("button").all()) {
          const box = await button.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.reload();
      await navigate(page, "Settings");
      await expect(groups.getByRole("checkbox", { name: "Show News", exact: true })).not.toBeChecked();
      expect(await names()).toEqual(["Sports", "News", other]);
      await navigate(page, "Channels");
      await expect(page.locator("#view-count")).toHaveText("2");
      await expect(page.locator("#categories .chip")).toHaveCount(3);
      await expect(page.locator("#cat-menu .cat-label")).toHaveText(["All", "Sports", other]);
      await expect(page.locator("#continue-row")).not.toContainText("Alpha");
      await expect(page.locator("#pl-switch-btn")).toContainText("2 канала");
      await page.locator("#search").fill("bulletin");
      await expect(page.locator("#channel-list .channel-card")).toHaveCount(0);
      await page.locator("#search").fill("");
      for (const section of ["Favorites", "Recent"]) {
        await navigate(page, section);
        await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
        await expect(page.locator("#channel-list .channel-card").first()).toContainText("Beta");
      }
      await page.locator("#pl-switch-btn").click();
      await page.locator("#pl-switch-menu button").filter({ hasText: "two" }).click();
      await navigate(page, "Settings");
      await expect(groups.getByRole("checkbox", { name: "Show News", exact: true })).toBeChecked();
      expect(await names()).toEqual(["News", other, "Sports"]);
      await page.locator("#pl-switch-btn").click();
      await page.locator("#pl-switch-menu button").filter({ hasText: "one" }).click();
      await navigate(page, "Settings");
      await expect(groups.getByRole("checkbox", { name: "Show News", exact: true })).not.toBeChecked();
      await page.locator("#groups-show-all").click();
      expect(await names()).toEqual(["Sports", "News", other]);
      await page.locator("#groups-reset-order").click();
      expect(await names()).toEqual(["News", other, "Sports"]);
      for (const checkbox of await groups.getByRole("checkbox").all()) await checkbox.uncheck();
      await navigate(page, "Channels");
      await expect(page.locator("#view-count")).toHaveText("0");
      await expect(page.locator("#categories .chip")).toHaveCount(1);
      await navigate(page, "Settings");
      await page.locator("#groups-show-all").click();
      await navigate(page, "Channels");
      await expect(page.locator("#channel-list .channel-card")).toHaveCount(3);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.favorites.v1:one")!))).toHaveLength(2);
    });
  }
}

test("hidden group deep link is blocked and storage changes remove a playing group", async ({ page }) => {
  await setup(page, 1440, "dark");
  await page.evaluate(() => localStorage.setItem("iptv-hub.groups.v1:one", JSON.stringify({ hidden: ["News"], order: [] })));
  await page.goto("/?ch=" + encodeURIComponent("https://fixture.test/a.mp4"));
  await expect(page.locator("#toast")).toContainText("This channel's group is hidden in settings");
  await expect(page.locator("#player-bar")).toBeHidden();
  await page.locator('#channel-list [data-channel-url="https://fixture.test/b.mp4"]').click();
  await expect(page.locator("#player-bar")).toBeVisible();
  await page.evaluate(() => {
    const key = "iptv-hub.groups.v1:one";
    const value = JSON.stringify({ hidden: ["News", "Sports"], order: [] });
    localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  });
  await expect(page.locator("#player-bar")).toBeHidden();
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
});

test("hiding a playing group saves its partial recording and keeps it playable", async ({ page }) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await setup(page, 1440, "dark", ready);
  await page.locator('#channel-list [data-channel-url="https://fixture.test/a.m3u8"]').click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await page.locator("#btn-rec").click();
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  release();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 15000 }).toBeGreaterThan(4);
  await navigate(page, "Settings");
  await page.locator("#group-preferences").getByRole("checkbox", { name: "Show News", exact: true }).uncheck();
  await expect(page.locator("#player-bar")).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1") ?? "[]").length)).toBe(1);
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1")!)[0] as { channelName: string; sizeBytes: number; programmeTitle: string });
  expect(meta.channelName).toBe("Alpha");
  expect(meta.programmeTitle).toBe("News bulletin");
  expect(meta.sizeBytes).toBeGreaterThan(0);
  await navigate(page, "Recordings");
  await page.locator(".recording-play").click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
});
