import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pbkdf2Sync } from "node:crypto";

test.use({ serviceWorkers: "block" });
const now = Date.now();
const sourceData = {
  "iptv-hub.playlists.v1": [{ id: "one", name: "One", playlistUrl: "https://fixture.test/one.m3u", epgUrl: null }, { id: "two", name: "Two", playlistUrl: "https://fixture.test/two.m3u", epgUrl: null }],
  "iptv-hub.active-playlist.v1": "two",
  "iptv-hub.theme.v1": "system",
  "iptv-hub.language.v1": "en",
  "iptv-hub.refresh.v1": "360",
  "iptv-hub.favorites.v1:two": ["https://fixture.test/a.mp4", "https://fixture.test/b.mp4"],
  "iptv-hub.favorites-order.v1:two": ["https://fixture.test/b.mp4", "https://fixture.test/a.mp4"],
  "iptv-hub.recents.v1:two": ["https://fixture.test/b.mp4"],
  "iptv-hub.channel-overrides.v1:two": [{ url: "https://fixture.test/b.mp4", alias: "Alias Beta", hidden: false }, { url: "https://fixture.test/d.mp4", alias: "", hidden: true }],
  "iptv-hub.groups.v1:two": { hidden: ["Hidden"], order: ["Open", "Locked", "Hidden"] },
  "iptv-hub.parental-pins.v1:two": [{ group: "Locked", salt: "0".repeat(32), hash: pbkdf2Sync("0123", Buffer.alloc(16), 100_000, 32, "sha256").toString("hex") }],
  "iptv-hub.player-settings.v1": { maxBufferLength: 60, lowLatencyMode: true, diagnosticsTimeoutMs: 12000, limitMobileQuality: true, mobileMaxHeight: 480, autoplayLastChannel: false, volumeBoost: true, volumePercent: 75 },
  "iptv-hub.positions.v1": { "https://fixture.test/movie.mp4": { t: 20, at: now } },
  "iptv-hub.channel-health.v1:two": { version: 1, failures: [{ url: "https://fixture.test/b.mp4", failedAt: now, kind: "http", status: 503 }] },
  "iptv-hub.recording-schedule.v1": [{ id: "scheduled", playlistId: "two", channelUrl: "https://fixture.test/a.m3u8", channelName: "Alpha", group: "Locked", title: "Later film", start: now + 3_600_000, stop: now + 7_200_000, repeat: "daily", revision: now, lastStart: null, status: "scheduled" }],
  "iptv-hub.reminders.v1:two": [{ channelUrl: "https://fixture.test/b.mp4", channelName: "Beta", title: "Later film", start: now + 3_600_000, stop: now + 7_200_000, leadMinutes: 10, notified: false }],
  "iptv-hub.reminder-settings.v1": { minutes: 10, desktop: false },
};

async function routes(context: BrowserContext) {
  await context.route("https://fixture.test/**", (route) => route.request().url().includes(".mp4")
    ? route.fulfill({ contentType: "video/mp4", body: readFileSync("tests/fixtures/recording.mp4") })
    : route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 group-title="Locked",Alpha\nhttps://fixture.test/a.mp4\n#EXTINF:-1 group-title="Open",Beta\nhttps://fixture.test/b.mp4\n#EXTINF:-1 group-title="Hidden",Gamma\nhttps://fixture.test/c.mp4\n#EXTINF:-1 group-title="Open",Delta\nhttps://fixture.test/d.mp4\n' }));
}
const nav = (page: Page, name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first();
async function importFile(page: Page, body: string) {
  await page.locator("#import-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(body) });
}

test("export v2 and import into a clean profile restore all settings and a working PIN", async ({ page, context, browser, baseURL }) => {
  await routes(context);
  await page.addInitScript((data) => {
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  }, sourceData);
  await page.goto("/");
  await nav(page, "Settings").click();
  const download = page.waitForEvent("download");
  await page.locator("#btn-export").click();
  const body = readFileSync((await (await download).path())!, "utf8");
  const backup = JSON.parse(body);
  expect(backup.version).toBe(2);
  expect(backup.parentalPins.two[0]).toEqual(sourceData["iptv-hub.parental-pins.v1:two"][0]);
  expect(backup.parentalPins.two[0].pin).toBeUndefined();

  const clean = await browser.newContext({ baseURL, serviceWorkers: "block", locale: "ru-RU" });
  await routes(clean);
  const target = await clean.newPage();
  await target.goto("/");
  expect(await target.evaluate(() => localStorage.getItem("iptv-hub.playlists.v1"))).toBeNull();
  await expect(target.locator("#btn-import")).toBeVisible();
  await importFile(target, body);
  await expect(target.locator("#pl-switch-btn")).toContainText("Two");
  await expect(target.locator("#toast")).toContainText("Playlists imported: 2");
  for (const [key, value] of Object.entries(sourceData)) {
    const raw = await target.evaluate((key) => localStorage.getItem(key), key);
    expect(typeof value === "string" ? raw : JSON.parse(raw!)).toEqual(value);
  }
  await nav(target, "Settings").click();
  await expect(target.locator("#player-buffer")).toHaveValue("60");
  await expect(target.locator("#player-low-latency")).toBeChecked();
  await expect(target.locator("#player-volume-boost")).toBeChecked();
  await expect(target.locator("#reminder-minutes")).toHaveValue("10");
  await expect(target.locator("#recording-schedule")).toContainText("Later film");
  await nav(target, "Channels").click();
  await expect(target.locator("#channel-list .channel-card")).toHaveCount(2);
  await expect(target.locator("#channel-list")).toContainText("Alias Beta");
  await expect(target.locator(".channel-failure")).toHaveCount(1);
  await nav(target, "Favorites").click();
  expect(await target.locator("#channel-list .channel-card").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.channelUrl))).toEqual(sourceData["iptv-hub.favorites-order.v1:two"]);
  await target.locator('#channel-list [data-channel-url="https://fixture.test/a.mp4"]').click();
  await expect(target.locator("#pin-dialog")).toBeVisible();
  await target.locator("#parental-pin").fill("0123");
  await target.locator('#pin-dialog button[type="submit"]').click();
  await expect(target.locator("#video")).toHaveJSProperty("videoWidth", 160);
  await clean.close();
});

test("v1 import remains compatible and deep-link parameters cannot undo import", async ({ page, context }) => {
  await routes(context);
  await page.goto("/?p=https%3A%2F%2Ffixture.test%2Fone.m3u&ch=Alpha");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(4);
  const legacy = { version: 1, theme: "light", playlists: [sourceData["iptv-hub.playlists.v1"][1]], activeId: "two", favorites: { two: ["https://fixture.test/b.mp4"] }, recents: { two: ["https://fixture.test/a.mp4"] } };
  await importFile(page, JSON.stringify(legacy));
  await expect(page.locator("#pl-switch-btn")).toContainText("Two");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("iptv-hub.active-playlist.v1"))).toBe("two");
  expect(new URL(page.url()).searchParams.has("p")).toBe(false);
  expect(new URL(page.url()).searchParams.has("ch")).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.playlists.v1")!).length)).toBe(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("export captures the current VOD position; stopping playback cannot overwrite imported positions", async ({ page, context }) => {
  await routes(context);
  await page.addInitScript((playlist) => {
    if (localStorage.getItem("iptv-hub.playlists.v1")) return;
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([playlist]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "two");
  }, sourceData["iptv-hub.playlists.v1"][1]);
  await page.goto("/");
  await page.locator('#channel-list [data-channel-url="https://fixture.test/b.mp4"]').click();
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(1);
  const position = await page.locator("#video").evaluate((el: HTMLVideoElement) => { el.pause(); return el.currentTime; });
  await nav(page, "Settings").click();
  const download = page.waitForEvent("download");
  await page.locator("#btn-export").click();
  const backup = JSON.parse(readFileSync((await (await download).path())!, "utf8"));
  expect(backup.positions["https://fixture.test/b.mp4"].t).toBeCloseTo(position);
  backup.positions["https://fixture.test/b.mp4"].t = 20;
  await importFile(page, JSON.stringify(backup));
  await expect(page.locator("#toast")).toContainText("Playlists imported: 1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.positions.v1")!)["https://fixture.test/b.mp4"].t)).toBe(20);
});

test("damaged sections are diagnosed, valid data survives and active recording is not resumed", async ({ page, context }) => {
  await routes(context);
  await page.goto("/");
  const damaged = { version: 2, theme: "dark", playlists: [sourceData["iptv-hub.playlists.v1"][1]], activeId: "two", favorites: {},
    parentalPins: "bad", groupPreferences: { two: { hidden: ["Hidden", 123], order: ["Open"] } },
    playerSettings: { ...sourceData["iptv-hub.player-settings.v1"], maxBufferLength: -1 },
    recordingSchedule: { two: [{ ...sourceData["iptv-hub.recording-schedule.v1"][0], status: "recording", start: now - 60_000, stop: now + 60_000, lastStart: now - 60_000 }] },
    positions: { "https://fixture.test/movie.mp4": { t: 20, at: now }, broken: null } };
  await importFile(page, JSON.stringify(damaged));
  await expect(page.locator("#pl-switch-btn")).toContainText("Two");
  await page.locator("#notif-bell").click();
  await expect(page.locator("#notif-list")).toContainText("parentalPins");
  await expect(page.locator("#notif-list")).toContainText("playerSettings");
  const rule = await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recording-schedule.v1")!)[0]);
  expect(rule.status).toBe("missed");
  expect(rule.lastStart).toBe(now - 60_000);
  await expect(page.locator("#player-bar")).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.player-settings.v1")!).maxBufferLength)).toBe(30);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.positions.v1")!))).toEqual({ "https://fixture.test/movie.mp4": { t: 20, at: now } });
});
