import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function setup(page: Page, options: { width?: number; epg?: boolean; depth?: number; source?: boolean; firstSecond?: boolean; record?: boolean; archiveHls?: boolean } = {}) {
  await page.setViewportSize({ width: options.width ?? 1440, height: 900 });
  const now = Math.floor(Date.now() / 1000) * 1000 + 500;
  await page.clock.setFixedTime(new Date(now));
  const start = options.firstSecond ? now - 500 : now - 1_800_500;
  const archiveFile = options.archiveHls ? "archive.m3u8" : "archive.mp4";
  const date = (ms: number) => new Date(ms).toISOString().replace(/\D/g, "").slice(0, 14) + " +0000";
  let release = () => {};
  const ready = options.record ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();
  await page.route("https://fixture.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith(".xml")) return route.fulfill({ contentType: "application/xml", body: `<tv><channel id="a"><display-name>Alpha</display-name></channel><programme channel="a" start="${date(start)}" stop="${date(now + 1_800_000)}"><title>Current show</title></programme></tv>` });
    if (url.includes(".mp4")) return route.fulfill({ contentType: "video/mp4", body: readFileSync("tests/fixtures/recording.mp4") });
    if (url.endsWith(".ts")) {
      if (!url.endsWith("/0.ts")) await ready;
      return route.fulfill({ contentType: "video/mp2t", body: readFileSync("tests/fixtures/recording.mpegts") });
    }
    if (url.includes(".m3u8")) {
      const entries = Array.from({ length: 20 }, (_, i) => `#EXT-X-DISCONTINUITY\n#EXTINF:4,\n${i}.ts`).join("\n");
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-TARGETDURATION:4\n${entries}\n#EXT-X-ENDLIST\n` });
    }
    return route.fulfill({ body: `#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="Locked" catchup-days="${options.depth ?? 3}" ${options.source === false ? "" : `catchup-source="https://fixture.test/${archiveFile}?utc={utc}"`},Alpha\nhttps://fixture.test/live.m3u8\n` });
  });
  await page.addInitScript((epg) => {
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "test", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: epg ? "https://fixture.test/epg.xml" : null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "test");
  }, options.epg !== false);
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  return { archiveUrl: `https://fixture.test/${archiveFile}?utc=${Math.floor(start / 1000)}`, release };
}

async function pin(page: Page) {
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
}

const nav = (page: Page, name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first();

for (const width of [390, 1440]) {
  test(`start current programme, archive progress and return to live (${width})`, async ({ page }) => {
    const { archiveUrl } = await setup(page, { width });
    await page.locator("#channel-list .channel-card").click();
    if (width < 1024) await page.locator("#video").click();
    await expect(page.locator("#now-show")).toHaveText("Current show");
    const button = page.locator("#btn-programme-start");
    await expect(button).toBeVisible();
    await button.click();
    const video = page.locator("#video");
    await expect(video).toHaveAttribute("src", archiveUrl);
    await expect(video).toHaveJSProperty("videoWidth", 160);
    await page.locator("#btn-pause").dispatchEvent("click");
    expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(2);
    await expect(button).toBeHidden();
    await expect(page.locator("#btn-live")).toBeVisible();
    expect(await page.locator("#scrub-fill").evaluate((el) => parseFloat((el as HTMLElement).style.width))).toBeLessThan(1);
    await expect(page.locator("#now-show")).toHaveText("Current show");
    const liveRequest = page.waitForRequest("https://fixture.test/live.m3u8");
    await page.locator("#btn-live").click();
    await liveRequest;
    await expect(button).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const [name, options] of [
  ["no EPG", { epg: false }], ["no archive", { depth: 0 }],
  ["no template", { source: false }], ["first second", { firstSecond: true }],
] as const) {
  test(`start button hidden: ${name}`, async ({ page }) => {
    await setup(page, options);
    await page.locator("#channel-list .channel-card").click();
    await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
    await expect(page.locator("#btn-programme-start")).toBeHidden();
  });
}

test("start and return require PIN; cancelled PIN keeps recording, approved PIN saves it", async ({ page }) => {
  const { archiveUrl, release } = await setup(page, { record: true });
  await nav(page, "Настройки").click();
  await page.locator("#pin-group").selectOption("Locked");
  await page.locator("#pin-set").click();
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog [name="confirmation"]').fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#pin-dialog")).toBeHidden();
  await nav(page, "Каналы").click();
  await page.locator("#channel-list .channel-card").click();
  await pin(page);
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  await page.locator("#btn-rec").click();
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  release();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0)).toBeGreaterThan(4);
  await page.locator("#video").hover();
  const source = await page.locator("#video").getAttribute("src");
  await page.locator("#btn-programme-start").click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#video")).toHaveAttribute("src", source!);
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  await page.locator("#btn-programme-start").click();
  await pin(page);
  await expect(page.locator("#video")).toHaveAttribute("src", archiveUrl);
  await expect(page.locator("#btn-rec")).not.toHaveClass(/recording/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1") ?? "[]").length)).toBe(1);
  expect(await page.evaluate(async () => {
    const recording = JSON.parse(localStorage.getItem("iptv-hub.recordings.v1")!)[0];
    const dir = await navigator.storage.getDirectory();
    const file = await (await dir.getFileHandle(`done-${recording.id}.${recording.ext}`)).getFile();
    return file.size;
  })).toBeGreaterThan(0);
  await page.locator("#btn-live").click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#video")).toHaveAttribute("src", archiveUrl);
  await page.locator("#btn-live").click();
  await pin(page);
  await expect(page.locator("#btn-programme-start")).toBeVisible();
});

test("explicit start over ignores a valid saved HLS archive position", async ({ page }) => {
  const { archiveUrl } = await setup(page, { archiveHls: true });
  await page.evaluate((url) => localStorage.setItem("iptv-hub.positions.v1", JSON.stringify({
    [url]: { t: 20, at: Date.now() },
    "https://fixture.test/live.m3u8": { t: 20, at: Date.now() },
  })), archiveUrl);
  await page.locator("#channel-list .channel-card").click();
  const video = page.locator("#video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(19);
  await video.hover();
  const request = page.waitForRequest(archiveUrl);
  await page.locator("#btn-programme-start").click();
  await request;
  await expect(page.locator("#now-title")).toHaveAttribute("title", archiveUrl);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.1);
  await page.locator("#btn-pause").dispatchEvent("click");
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(2);
});
