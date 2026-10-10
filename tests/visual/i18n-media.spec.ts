import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ serviceWorkers: "block", locale: "en-US" });
async function language(page: Page, value: "en" | "ru") {
  await page.locator(`[data-language="${value}"]`).dispatchEvent("click");
  await expect(page.locator("html")).toHaveAttribute("lang", value);
}
async function fixture(page: Page) {
  const date = (offset: number) => new Date(Date.now() + offset).toISOString().replace(/\D/g, "").slice(0, 14) + " +0000";
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith(".xml")) return route.fulfill({ contentType: "application/xml", body: `<tv><channel id="one"><display-name>Канал</display-name></channel><programme channel="one" start="${date(-600_000)}" stop="${date(3600_000)}"><title>Передача</title></programme></tv>` });
    if (url.endsWith(".m3u")) return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="one",Канал\nhttps://fixture.test/live.mp4\n' });
    return route.fulfill({ body: readFileSync("tests/fixtures/recording.mp4"), contentType: "video/mp4" });
  });
  await page.addInitScript(() => {
    if (localStorage.getItem("iptv-hub.playlists.v1")) return;
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "Плейлист", playlistUrl: "https://fixture.test/list.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  });
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toContainText("Передача");
}

test("player, guide and dates change language without reload or stream restart", async ({ page }) => {
  await fixture(page);
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  const source = await page.locator("#video").evaluate((el: HTMLVideoElement) => el.src);
  await page.evaluate(() => { (window as unknown as { noReload: number }).noReload = 42; });
  await expect(page.locator("#now-fav")).toHaveAttribute("title", "Add to favorites");
  await expect(page.locator("#btn-pause")).toHaveAttribute("title", "Pause / resume (Space)");
  await expect(page.locator("#now-schedule .sched-head h3")).toHaveText("Programme guide");
  await expect(page.locator("#schedule-date-switcher .schedule-date-btn.current")).toHaveText("Today");
  await expect(page.locator("#sched-list .prog-status.live")).toHaveText("Live");
  await expect(page.locator("#schedule-date-switcher .schedule-date-btn").nth(0)).toContainText("/");
  await language(page, "ru");
  await expect(page.locator("#now-schedule .sched-head h3")).toHaveText("Программа");
  await expect(page.locator("#schedule-date-switcher .schedule-date-btn.current")).toHaveText("Сегодня");
  await expect(page.locator("#sched-list .prog-status.live")).toHaveText("Эфир");
  await expect(page.locator("#schedule-date-switcher .schedule-date-btn").nth(0)).toContainText(".");
  await expect(page.locator("#now-fav")).toHaveAttribute("title", "В избранное");
  await language(page, "en");
  await expect(page.locator("#sched-list .prog-status.live")).toHaveText("Live");
  await page.locator("#schedule-date-switcher .schedule-date-btn").nth(8).click();
  await expect(page.locator("#now-schedule")).toBeHidden();
  await language(page, "ru");
  await expect(page.locator("#now-schedule")).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { noReload: number }).noReload)).toBe(42);
  expect(await page.locator("#video").evaluate((el: HTMLVideoElement) => el.src)).toBe(source);
});

test("recording actions, dates and playback labels change language in place", async ({ page }) => {
  await fixture(page);
  await page.evaluate(async (bytes) => {
    const dir = await navigator.storage.getDirectory();
    const writer = await (await dir.getFileHandle("done-fixture.mp4", { create: true })).createWritable();
    await writer.write(new Uint8Array(bytes));
    await writer.close();
    localStorage.setItem("iptv-hub.recordings.v1", JSON.stringify([{ id: "fixture", channelName: "Запись канала", channelUrl: "", programmeTitle: null, startedAt: new Date(2026, 8, 28, 19, 5).getTime(), durationSec: 4, sizeBytes: bytes.length, ext: "mp4" }]));
    localStorage.setItem("iptv-hub.view.v1", "recordings");
  }, [...readFileSync("tests/fixtures/recording.mp4")]);
  await page.reload();
  await expect(page.locator(".recording-act").first()).toHaveAttribute("title", "Download file");
  await expect(page.locator(".recording-sub")).toContainText("9/28/2026");
  await language(page, "ru");
  await expect(page.locator(".recording-act").first()).toHaveAttribute("title", "Скачать файл");
  await expect(page.locator(".recording-sub")).toContainText("28.09.2026");
  await page.locator(".recording-play").click();
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  await language(page, "en");
  await expect(page.locator("#now-title")).toHaveText("Запись канала · recording");
  await expect(page.locator("#scrub")).toHaveAttribute("aria-label", "Recording position");
  await expect(page.locator("#toast")).toContainText("Recording from");
  await language(page, "ru");
  await expect(page.locator("#now-title")).toHaveText("Запись канала · запись");
});
