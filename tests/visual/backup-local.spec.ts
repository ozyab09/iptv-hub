import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ serviceWorkers: "block" });
const m3u = "#EXTM3U\n#EXTINF:-1,Local One\nhttps://fixture.test/one.mp4\n#EXTINF:-1,Local Two\nhttps://fixture.test/two.mp4\n";
const nav = (page: Page, name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first();
const legacy = { version: 1, theme: "dark", playlists: [{ id: "file", name: "File", playlistUrl: "local:old", epgUrl: null }], activeId: "file", favorites: {} };
async function importBackup(page: Page, body: string) {
  await page.locator("#import-file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(body) });
}

test("local M3U export restores the same ID, channels and EPG file in a clean profile", async ({ page, browser, baseURL }) => {
  await page.addInitScript(() => localStorage.setItem("iptv-hub.language.v1", "en"));
  await page.goto("/");
  await page.locator("#local-file").setInputFiles({ name: "Local.m3u", mimeType: "audio/x-mpegurl", buffer: Buffer.from(m3u) });
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
  const id = await page.evaluate(async () => {
    const id = JSON.parse(localStorage.getItem("iptv-hub.playlists.v1")!)[0].id as string;
    const dir = await navigator.storage.getDirectory();
    const writer = await (await dir.getFileHandle(`local:${id}:epg`, { create: true })).createWritable();
    await writer.write("<tv></tv>");
    await writer.close();
    return id;
  });
  await nav(page, "Settings").click();
  const downloading = page.waitForEvent("download");
  await page.locator("#btn-export").click();
  const body = readFileSync((await (await downloading).path())!, "utf8");
  expect(JSON.parse(body).localPlaylists).toEqual({ [id]: { m3u, epg: "<tv></tv>" } });
  const clean = await browser.newContext({ baseURL, serviceWorkers: "block" });
  try {
    const target = await clean.newPage();
    await target.goto("/");
    expect(await target.evaluate(() => localStorage.getItem("iptv-hub.playlists.v1"))).toBeNull();
    await importBackup(target, body);
    await expect(target.locator("#pl-switch-name")).toHaveText("Local");
    await expect(target.locator("#channel-list .channel-card")).toHaveCount(2);
    await expect(target.locator("#toast")).toContainText("Playlists imported: 1");
    expect(await target.evaluate(async (id) => {
      const dir = await navigator.storage.getDirectory();
      return {
        playlist: JSON.parse(localStorage.getItem("iptv-hub.playlists.v1")!)[0],
        m3u: await (await (await dir.getFileHandle(`local:${id}`)).getFile()).text(),
        epg: await (await (await dir.getFileHandle(`local:${id}:epg`)).getFile()).text(),
      };
    }, id)).toEqual({ playlist: { id, name: "Local", playlistUrl: `local:${id}`, epgUrl: null }, m3u, epg: "<tv></tv>" });
    await target.reload();
    await expect(target.locator("#channel-list .channel-card")).toHaveCount(2);
  } finally { await clean.close(); }
});

test("legacy local metadata survives import and missing files are explicitly reported and exported", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iptv-hub.language.v1", "en"));
  await page.goto("/");
  await importBackup(page, JSON.stringify(legacy));
  await expect(page.locator("#toast")).toContainText("Local playlist files missing from backup: 1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.playlists.v1")!)[0].playlistUrl)).toBe("local:file");
  await page.locator("#notif-bell").click();
  await expect(page.locator("#notif-list")).toContainText("Add these M3U files again");
  await page.locator("#notif-bell").click();
  const downloading = page.waitForEvent("download");
  await page.locator("#btn-export").click();
  const body = readFileSync((await (await downloading).path())!, "utf8");
  expect(JSON.parse(body).localPlaylists).toEqual({});
  await expect(page.locator("#toast")).toContainText("Local playlist files missing from backup: 1");
});

test("OPFS failure leaves existing playlist metadata untouched", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    navigator.storage.getDirectory = () => Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.goto("/");
  await importBackup(page, JSON.stringify({ ...legacy, version: 2, localPlaylists: { file: { m3u, epg: null } } }));
  await expect(page.locator("#toast")).toContainText("Could not save the backup");
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.playlists.v1"))).toBeNull();
});
