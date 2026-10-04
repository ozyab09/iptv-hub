import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createPinHash } from "../../src/parental-pin";

test.use({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
async function fixture(page: Page): Promise<void> {
  const media = readFileSync("tests/fixtures/recording.mp4");
  const pin = await createPinHash("0123");
  const date = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const now = Date.now();
  await page.route("https://fixture.test/**", route => {
    const url = route.request().url();
    if (url.endsWith(".xml")) return route.fulfill({ body: `<tv><programme channel="same" start="${date(now - 3600000)}" stop="${date(now + 3600000)}"><title>${url.includes("one") ? "One show" : "Two show"}</title></programme></tv>` });
    if (url.endsWith(".mp4")) return route.fulfill({ contentType: "video/mp4", body: media });
    const shared = '#EXTINF:-1 group-title="Shared",Duplicate\nhttps://fixture.test/shared.mp4\n';
    return route.fulfill({ body: '#EXTM3U\n' + (url.includes("one") ? '#EXTINF:-1 tvg-id="same" group-title="News",Alpha\nhttps://fixture.test/a.mp4\n' : '#EXTINF:-1 tvg-id="same" group-title="News",Bravo\nhttps://fixture.test/b.mp4\n#EXTINF:-1 group-title="Hidden",Hidden\nhttps://fixture.test/hidden.mp4\n#EXTINF:-1 group-title="Locked",Protected\nhttps://fixture.test/locked.mp4\n') + shared });
  });
  await page.addInitScript(pin => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "One", playlistUrl: "https://fixture.test/one.m3u", epgUrl: "https://fixture.test/one.xml" }, { id: "two", name: "Two", playlistUrl: "https://fixture.test/two.m3u", epgUrl: "https://fixture.test/two.xml" }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    localStorage.setItem("iptv-hub.groups.v1:two", JSON.stringify({ hidden: ["Hidden"], order: [] }));
    localStorage.setItem("iptv-hub.channel-overrides.v1:two", JSON.stringify([{ url: "https://fixture.test/b.mp4", alias: "Alias Bravo", hidden: false }]));
    localStorage.setItem("iptv-hub.parental-pins.v1:two", JSON.stringify([{ group: "Locked", ...pin }]));
  }, pin);
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
}
async function select(page: Page, name: string): Promise<void> {
  await page.locator("#pl-switch-btn").click();
  await page.locator("#pl-switch-menu button").filter({ hasText: new RegExp(`^${name}$`) }).click();
}
test("aggregate dedup, source EPG, aliases and favorite ownership", async ({ page }) => {
  await fixture(page); await select(page, "All playlists");
  const rows = page.locator("#channel-list .channel-card");
  await expect(rows).toHaveCount(4);
  await expect(page.locator("#view-count")).toHaveText("4");
  await expect(rows.filter({ hasText: "Alpha" })).toContainText("One show");
  await expect(rows.filter({ hasText: "Alias Bravo" })).toContainText("Two show");
  await expect(rows.filter({ hasText: "Duplicate" }).locator(".channel-source")).toHaveText("One");
  await expect(page.locator("#categories")).toContainText("One · News");
  await expect(page.locator("#categories")).toContainText("Two · News");
  await page.screenshot({ path: "test-results/all-playlists.png" });
  await rows.filter({ hasText: "Alias Bravo" }).locator(".star").click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.favorites.v1:two") ?? "[]"))).toEqual(["https://fixture.test/b.mp4"]);
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.favorites.v1:one"))).toBeNull();
  await rows.filter({ hasText: "Alias Bravo" }).locator(".channel-hit").click();
  await expect(page.locator("#now-title")).toHaveText("Alias Bravo");
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
});
test("source PIN blocks playback without changing source or recents on cancellation", async ({ page }) => {
  await fixture(page); await select(page, "All playlists");
  await page.locator(".channel-card").filter({ hasText: "Protected" }).locator(".channel-hit").click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.active-playlist.v1"))).toBe("one");
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.recents.v1:two"))).toBeNull();
  await page.locator(".channel-card").filter({ hasText: "Protected" }).locator(".channel-hit").click();
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/locked.mp4");
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.active-playlist.v1"))).toBe("two");
});
for (const source of ["One", "Two"]) test(`All → ${source} → All preserves filters and playback`, async ({ page }) => {
  await fixture(page); await select(page, "All playlists");
  await page.locator(".channel-card").filter({ hasText: "Alpha" }).locator(".channel-hit").click();
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  await page.locator("#search").fill("Alpha");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await page.evaluate(() => { (window as Window & { starts?: number }).starts = 0; document.querySelector("video")!.addEventListener("loadstart", () => { (window as Window & { starts?: number }).starts!++; }); });
  let playlistFetches = 0;
  page.on("request", request => { if (request.url().endsWith(".m3u")) playlistFetches++; });
  await select(page, source); await select(page, "All playlists");
  await expect(page.locator("#search")).toHaveValue("Alpha");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  expect(await page.evaluate(() => (window as Window & { starts?: number }).starts)).toBe(0);
  expect(playlistFetches).toBe(0);
  await expect(page.locator("#now-title")).toHaveText("Alpha");
});

test("cross-tab hiding and PIN changes apply to the owning source", async ({ page }) => {
  await fixture(page); await select(page, "All playlists");
  await page.evaluate(() => {
    const key = "iptv-hub.groups.v1:two";
    localStorage.setItem(key, JSON.stringify({ hidden: ["Hidden", "News"], order: [] }));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  });
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(3);
  await expect(page.locator("#channel-list")).not.toContainText("Alias Bravo");
  await page.locator(".channel-card").filter({ hasText: "Alpha" }).locator(".channel-hit").click();
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  await select(page, "Two");
  await page.evaluate(() => { window.dispatchEvent(new StorageEvent("storage", { key: "iptv-hub.parental-pins.v1:one" })); });
  await expect(page.locator("#player-bar")).toBeHidden();
});
