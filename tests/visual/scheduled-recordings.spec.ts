import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });
async function setup(page: Page) {
  const now = new Date("2026-10-02T12:00:00Z");
  await page.clock.install({ time: now });
  const xmlDate = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "p", name: "TV", playlistUrl: "https://fixture.test/list.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "p");
  });
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("list.m3u")) return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="tv" group-title="News",TV\nhttps://fixture.test/live.m3u8\n' });
    if (url.endsWith("epg.xml")) return route.fulfill({ body: `<tv><channel id="tv"><display-name>TV</display-name></channel><programme channel="tv" start="${xmlDate(now.getTime() + 120000)}" stop="${xmlDate(now.getTime() + 180000)}"><title>Scheduled Show</title></programme></tv>` });
    if (url.endsWith(".ts")) return route.fulfill({ contentType: "video/mp2t", body: ts });
    return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4,\n0.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\n1.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\n2.ts\n" });
  });
  await page.goto("/");
  await page.locator("#channel-list .channel-card").click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await page.locator("#btn-guide").click();
  await page.locator("#guide-list .schedule-programme").click();
}

test("guide schedules, edits, automatically records and deletes a series", async ({ page }) => {
  await setup(page);
  const dialog = page.locator(".schedule-editor");
  await dialog.getByRole("radio", { name: "Every day" }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Recordings", visible: true }).first().click();
  const rule = page.locator(".schedule-card");
  await expect(rule).toContainText("Every day");
  await rule.getByRole("button", { name: "Edit schedule" }).click();
  await dialog.getByRole("radio", { name: "Weekdays" }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rule).toContainText("Weekdays");
  const watchedSource = await page.locator("#video").getAttribute("src");
  await page.clock.fastForward(120000);
  await expect(rule).toContainText("Recording");
  await expect.poll(() => page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const name of (dir as FileSystemDirectoryHandle & { keys(): AsyncIterableIterator<string> }).keys()) names.push(name);
    return names.some((name) => name.startsWith("schedule-rec-"));
  })).toBe(true);
  await expect.poll(() => page.locator(".scheduled-recording-video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await page.clock.fastForward(60000);
  await expect(rule).toContainText("Saved");
  await expect(page.locator(".recording-card")).toHaveCount(1);
  expect(await page.locator("#video").getAttribute("src")).toBe(watchedSource);
  await expect(page.locator(".recording-card")).toContainText("Scheduled Show");
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1")!)[0] as { sizeBytes: number });
  expect(meta.sizeBytes).toBeGreaterThan(0);
  await rule.getByRole("button", { name: "Delete schedule" }).click();
  await expect(rule).toHaveCount(0);
  await page.locator(".recording-play").click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
});

test("a PIN added before start prevents automatic playback and recording", async ({ page }) => {
  await setup(page);
  await page.locator(".schedule-editor").getByRole("button", { name: "Save", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("iptv-hub.parental-pins.v1:p", JSON.stringify([{ group: "News", salt: "0".repeat(32), hash: "0".repeat(64) }])));
  await page.clock.fastForward(120000);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recording-schedule.v1")!)[0].status)).toBe("failed");
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.recordings.v1"))).toBeNull();
});

test("backup import finishes an active recording before replacing rules and reloading", async ({ page }) => {
  await setup(page);
  await page.locator(".schedule-editor").getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.clock.fastForward(120000);
  await expect.poll(() => page.locator(".scheduled-recording-video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
  const download = page.waitForEvent("download");
  await page.locator("#btn-export").click();
  const backup = JSON.parse(readFileSync((await (await download).path())!, "utf8"));
  expect(backup.recordingSchedule.p[0].status).toBe("missed");
  const previousStart = backup.recordingSchedule.p[0].lastStart;
  backup.recordingSchedule.p[0].title = "Imported rule";
  await page.locator("#import-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator("#toast")).toContainText("Playlists imported: 1");
  await expect(page.locator(".scheduled-recording-video")).toHaveCount(0);
  const rule = await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recording-schedule.v1")!)[0]);
  expect(rule.title).toBe("Imported rule");
  expect(rule.status).toBe("missed");
  expect(rule.lastStart).toBe(previousStart);
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1")!));
  expect(records).toHaveLength(1);
  expect(records[0].sizeBytes).toBeGreaterThan(0);
});

test("deleting an active schedule saves its partial recording and removes its player", async ({ page }) => {
  await setup(page);
  await page.locator(".schedule-editor").getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Recordings", visible: true }).first().click();
  await page.clock.fastForward(120000);
  await expect.poll(() => page.locator(".scheduled-recording-video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await page.locator(".schedule-card").getByRole("button", { name: "Delete schedule" }).click();
  await page.clock.fastForward(1000);
  await expect(page.locator(".scheduled-recording-video")).toHaveCount(0);
  await expect(page.locator(".recording-card")).toHaveCount(1);
  await expect(page.locator(".schedule-card")).toHaveCount(0);
});

test("schedule editor fits mobile light and dark themes", async ({ page }, testInfo) => {
  await setup(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const dialog = page.locator(".schedule-editor");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.setAttribute("data-theme", value); document.documentElement.style.colorScheme = value; }, theme);
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: testInfo.outputPath(`schedule-${theme}.png`) });
  }
});
