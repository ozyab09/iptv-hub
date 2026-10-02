import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const key = "iptv-hub.channel-health.v1:one";
const primary = "https://fixture.test/bad.mp4";

async function navigate(page: Page, name: string): Promise<void> {
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first().click();
}

async function setup(page: Page, width = 1440, theme = "dark", epg = false) {
  await page.setViewportSize({ width, height: 900 });
  const media = readFileSync("tests/fixtures/recording.mp4");
  const state: { healthy: boolean; probeGate: Promise<void> | null } = { healthy: false, probeGate: null };
  const requests: string[] = [];
  const date = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const now = Date.now();
  await page.route("https://fixture.test/**", async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.endsWith(".m3u")) return route.fulfill({ body: `#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="News" catchup-days="2" catchup-source="https://fixture.test/archive.mp4?utc={utc}",Alpha\n${primary}\n#EXTINF:-1 tvg-id="a",Mirror\nhttps://fixture.test/bad-mirror.mp4\n#EXTINF:-1,Beta\nhttps://fixture.test/good.mp4\n` });
    if (url.endsWith(".xml")) return route.fulfill({ body: `<tv><channel id="a"><display-name>Alpha</display-name></channel><programme channel="a" start="${date(now - 3600000)}" stop="${date(now - 60000)}"><title>Archive show</title></programme></tv>` });
    if (url.includes("bad") || url.includes("archive")) {
      if (route.request().resourceType() !== "media" && state.probeGate) await state.probeGate;
      if (!state.healthy || url.includes("archive")) return route.fulfill({ status: 404 });
    }
    return route.fulfill({ body: media, contentType: "video/mp4" });
  });
  await page.addInitScript(({ theme, epg }) => {
    if (localStorage.getItem("iptv-hub.playlists.v1")) return;
    localStorage.setItem("iptv-hub.theme.v1", theme);
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify(["one", "two"].map((id) => ({ id, name: id, playlistUrl: `https://fixture.test/${id}.m3u`, epgUrl: epg ? "https://fixture.test/epg.xml" : null }))));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    localStorage.setItem("iptv-hub.favorites.v1:one", JSON.stringify(["https://fixture.test/bad.mp4"]));
  }, { theme, epg });
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
  return { state, requests };
}

const alpha = (page: Page) => page.locator(`#channel-list [data-channel-url="${primary}"]`);
async function fail(page: Page): Promise<void> {
  await alpha(page).click();
  if (await page.evaluate(() => innerWidth < 1024)) await page.locator("#player-bar").click();
  await expect(page.locator("#btn-retry")).toBeVisible();
  await expect(alpha(page)).toHaveClass(/has-failure/);
}

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`failure after mirrors persists, stays per playlist and clears on playback (${width}, ${theme})`, async ({ page }, testInfo) => {
      const { state, requests } = await setup(page, width, theme);
      const logo = await alpha(page).locator(".logo").evaluate((el) => getComputedStyle(el).backgroundColor);
      await fail(page);
      expect(requests).toContain("https://fixture.test/bad-mirror.mp4");
      await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").failures?.[0]?.status, key)).toBe(404);
      expect(await alpha(page).evaluate((el) => el.getBoundingClientRect().height)).toBe(72);
      expect(await alpha(page).locator(".logo").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(logo);
      expect(await alpha(page).locator(".channel-failure").evaluate((el) => {
        const reference = document.createElement("span");
        reference.style.color = "var(--accent)";
        el.append(reference);
        const same = getComputedStyle(el).color === getComputedStyle(reference).color;
        reference.remove();
        return same;
      })).toBe(false);
      await expect(alpha(page).locator(".channel-failure")).toHaveAttribute("aria-label", /HTTP 404/);
      const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).failures, key);
      expect(stored).toHaveLength(1);
      expect(stored[0].url).toBe(primary);
      await page.reload();
      await expect(alpha(page)).toHaveClass(/has-failure/);
      await navigate(page, "Favorites");
      await expect(alpha(page).locator(".channel-failure")).toBeVisible();
      await navigate(page, "Recent");
      await expect(alpha(page)).toHaveClass(/has-failure/);
      await navigate(page, "Channels");
      await page.locator("#search").fill("Alpha");
      await expect(alpha(page).locator(".channel-failure")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("health.png") });
      await page.locator("#search").fill("");
      await page.locator("#pl-switch-btn").click();
      await page.locator("#pl-switch-menu button").filter({ hasText: "two" }).click();
      await expect(alpha(page)).not.toHaveClass(/has-failure/);
      await page.locator("#pl-switch-btn").click();
      await page.locator("#pl-switch-menu button").filter({ hasText: "one" }).click();
      await expect(alpha(page)).toHaveClass(/has-failure/);
      await page.locator('#channel-list [data-channel-url="https://fixture.test/good.mp4"]').click();
      await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
      await expect(alpha(page)).toHaveClass(/has-failure/);
      state.healthy = true;
      await alpha(page).click();
      await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
      await expect(alpha(page)).not.toHaveClass(/has-failure/);
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
    });
  }
}

test("a late diagnosis cannot restore a recovered or manually cleared mark", async ({ page }) => {
  const { state } = await setup(page);
  let release = () => {};
  state.probeGate = new Promise<void>((resolve) => { release = resolve; });
  await fail(page);
  await navigate(page, "Settings");
  await page.locator("#channel-health-reset").click();
  release();
  await expect(page.locator("#toast")).toContainText("404");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await navigate(page, "Channels");
  await expect(alpha(page)).not.toHaveClass(/has-failure/);
  state.probeGate = new Promise<void>((resolve) => { release = resolve; });
  await page.locator("#btn-retry").click();
  await expect(alpha(page)).toHaveClass(/has-failure/);
  state.healthy = true;
  await page.locator("#btn-retry").click();
  await expect(alpha(page)).not.toHaveClass(/has-failure/);
  release();
  await page.waitForTimeout(200);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
});

test("archive and corrupt recording errors never mark the live channel", async ({ page }) => {
  await setup(page, 1440, "dark", true);
  await page.locator("#search").fill("Archive show");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#btn-retry")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const file = await dir.getFileHandle("done-bad.mp4", { create: true });
    const sink = await file.createWritable();
    await sink.write(new Uint8Array([0, 1, 2, 3])); await sink.close();
    localStorage.setItem("iptv-hub.recordings.v1", JSON.stringify([{ id: "bad", channelName: "Alpha", channelUrl: "https://fixture.test/bad.mp4", programmeTitle: null, startedAt: 1000, durationSec: 4, sizeBytes: 4, ext: "mp4" }]));
  });
  await navigate(page, "Recordings");
  await page.locator(".recording-play").click();
  await expect(page.locator("#toast")).toContainText("recording");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
});

test("manual reset and playlist removal clear only this playlist's key", async ({ page }) => {
  await setup(page);
  await fail(page);
  await navigate(page, "Settings");
  await page.locator("#channel-health-reset").click();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await navigate(page, "Channels");
  await page.locator('#channel-list [data-channel-url="https://fixture.test/good.mp4"]').click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await fail(page);
  await page.evaluate(() => localStorage.setItem("iptv-hub.channel-health.v1:two", "keep"));
  await navigate(page, "Settings");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".pl-del").first().click();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.channel-health.v1:two"))).toBe("keep");
});
