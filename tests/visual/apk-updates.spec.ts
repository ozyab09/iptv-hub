import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { APK_RELEASE_URL, APK_VERSION_URL } from "../../src/apk-updates";

test.use({ serviceWorkers: "block" });
const androidUrl = "https://appassets.androidplatform.net/www/index.html";

async function fixture(page: Page, baseURL: string, remote: unknown, enabled = true) {
  let requests = 0;
  await page.route(APK_VERSION_URL, route => { requests++; return route.fulfill({ json: remote }); });
  await page.route("https://appassets.androidplatform.net/**", route => {
    const url = new URL(route.request().url());
    return route.fetch({ url: new URL(url.pathname.replace(/^\/www\//, "/") + url.search, baseURL).href })
      .then(response => route.fulfill({ response }));
  });
  await page.route("https://fixture.test/playlist.m3u", route => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://fixture.test/live.mp4" }));
  await page.addInitScript((enabled) => {
    if (localStorage.getItem("iptv-hub.app-settings.v1") === null) localStorage.setItem("iptv-hub.app-settings.v1", JSON.stringify({ checkUpdates: enabled }));
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "One", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  }, enabled);
  return () => requests;
}

test("Android new APK notification links to Releases, deduplicates and setting survives backup/reload", async ({ page, baseURL }) => {
  const requests = await fixture(page, baseURL!, { versionName: "9999.0.0", versionCode: 2147483647 });
  await page.goto(androidUrl);
  await expect(page.locator("#notif-badge")).toHaveText("1");
  await page.locator("#notif-bell").click();
  await expect(page.locator("#notif-list")).toContainText("9999.0.0");
  await expect(page.locator(".notification-download")).toHaveAttribute("href", APK_RELEASE_URL);
  await expect(page.locator(".notification-download")).toHaveText("Download APK");
  await page.reload();
  await expect.poll(requests).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.notifications.v1")!).length)).toBe(1);
  await page.locator("#side-nav button").filter({ hasText: "Settings" }).first().click();
  await expect(page.locator("#apk-updates-settings")).toBeVisible();
  await page.locator("#apk-check-updates").uncheck();
  await page.reload();
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  expect(requests()).toBe(2);
  await page.locator("#side-nav button").filter({ hasText: "Settings" }).first().click();
  await expect(page.locator("#apk-check-updates")).not.toBeChecked();
  const download = page.waitForEvent("download");
  await page.locator("#btn-export").click();
  const body = readFileSync((await (await download).path())!, "utf8");
  expect(JSON.parse(body).appSettings).toEqual({ checkUpdates: false });
  await page.evaluate(() => localStorage.setItem("iptv-hub.app-settings.v1", '{"checkUpdates":true}'));
  await page.locator("#import-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(body) });
  await expect(page.locator("#toast")).toContainText("Playlists imported");
  await page.locator("#side-nav button").filter({ hasText: "Settings" }).first().click();
  await expect(page.locator("#apk-check-updates")).not.toBeChecked();
  expect(requests()).toBe(2);
});

test("same APK shows no update; web/PWA never requests Android metadata", async ({ page, baseURL }) => {
  const version = JSON.parse(readFileSync("public/version.json", "utf8"));
  const requests = await fixture(page, baseURL!, version);
  const loaded = page.waitForResponse(APK_VERSION_URL);
  await page.goto(androidUrl); await loaded;
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.notifications.v1"))).toBeNull();
  expect(requests()).toBe(1);
  await page.goto(baseURL!);
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await page.locator("#side-nav button").filter({ hasText: "Settings" }).first().click();
  await expect(page.locator("#apk-updates-settings")).toBeHidden();
  expect(requests()).toBe(1);
});
