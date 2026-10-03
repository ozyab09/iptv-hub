import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const url = (letter: string) => `https://fixture.test/${letter}.mp4`;
const rows = (page: Page) => page.locator("#channel-list .channel-card");
const channel = (page: Page, letter: string) => page.locator(`#channel-list [data-channel-url="${url(letter)}"]`);
const order = (page: Page) => rows(page).evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.channelUrl));
const navigate = (page: Page, name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first().click();

test.beforeEach(async ({ context, page }) => {
  await context.route("https://fixture.test/**", (route) => route.request().url().endsWith(".mp4")
    ? route.fulfill({ contentType: "video/mp4", body: readFileSync("tests/fixtures/recording.mp4") })
    : route.fulfill({ body: '#EXTM3U\n' + ["Alpha", "Beta", "Gamma", "Omega"].map((name, i) => `#EXTINF:-1,${name}\nhttps://fixture.test/${"abcd"[i]}.mp4\n`).join("") }));
  await context.addInitScript(() => {
    if (localStorage.getItem("iptv-hub.playlists.v1")) return;
    const urls = ["a", "b", "c"].map((letter) => `https://fixture.test/${letter}.mp4`);
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify(["one", "two"].map((id) => ({ id, name: id, playlistUrl: `https://fixture.test/${id}.m3u`, epgUrl: null }))));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    localStorage.setItem("iptv-hub.view.v1", "favorites");
    for (const id of ["one", "two"]) localStorage.setItem(`iptv-hub.favorites.v1:${id}`, JSON.stringify(urls));
    localStorage.setItem("iptv-hub.favorites-order.v1:two", JSON.stringify([urls[1], urls[0], urls[2]]));
  });
  await page.goto("/");
  await expect(rows(page)).toHaveCount(3);
});

test("drag and Alt arrows persist order, keep focus and append new/re-added favorites", async ({ page }) => {
  await channel(page, "c").dragTo(channel(page, "a"));
  await expect.poll(() => order(page)).toEqual([url("c"), url("a"), url("b")]);
  await channel(page, "c").press("Alt+ArrowDown");
  await expect.poll(() => order(page)).toEqual([url("a"), url("c"), url("b")]);
  await expect(channel(page, "c")).toBeFocused();
  await expect(page.locator("#player-bar")).toBeHidden();
  await page.reload();
  await expect.poll(() => order(page)).toEqual([url("a"), url("c"), url("b")]);
  await channel(page, "c").locator(".channel-actions button").first().click();
  await expect.poll(() => order(page)).toEqual([url("a"), url("b")]);
  await navigate(page, "Каналы");
  await channel(page, "c").locator(".channel-actions button").first().click();
  await channel(page, "d").locator(".channel-actions button").first().click();
  await navigate(page, "Избранное");
  await expect.poll(() => order(page)).toEqual([url("a"), url("b"), url("c"), url("d")]);
  await channel(page, "a").press("Alt+ArrowUp");
  await expect.poll(() => order(page)).toEqual([url("a"), url("b"), url("c"), url("d")]);
});

test("order synchronizes between real tabs and stays per playlist", async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto("/");
  await expect(rows(other)).toHaveCount(3);
  await channel(page, "c").dragTo(channel(page, "a"));
  await expect.poll(() => order(other)).toEqual([url("c"), url("a"), url("b")]);
  await page.locator("#pl-switch-btn").click();
  await page.locator("#pl-switch-menu button").filter({ hasText: "two" }).click();
  await expect.poll(() => order(page)).toEqual([url("b"), url("a"), url("c")]);
  await page.locator("#pl-switch-btn").click();
  await page.locator("#pl-switch-menu button").filter({ hasText: "one" }).click();
  await expect.poll(() => order(page)).toEqual([url("c"), url("a"), url("b")]);
  await expect.poll(() => order(other)).toEqual([url("c"), url("a"), url("b")]);
  await channel(other, "c").press("Alt+ArrowDown");
  await expect.poll(() => order(page)).toEqual([url("a"), url("c"), url("b")]);
});

test("card ordering leaves channel navigation, ZAP and Continue unchanged", async ({ page }) => {
  await channel(page, "c").dragTo(channel(page, "a"));
  await channel(page, "c").click();
  await expect(page.locator("#now-title")).toHaveText("Gamma");
  await page.keyboard.press("1");
  await expect(page.locator("#now-title")).toHaveText("Alpha");
  await page.locator("#btn-next").dispatchEvent("click");
  await expect(page.locator("#now-title")).toHaveText("Beta");
  await navigate(page, "Каналы");
  await expect.poll(() => order(page)).toEqual([url("a"), url("b"), url("c"), url("d")]);
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recents.v1:one")!));
  expect(recent).toEqual([url("b"), url("a"), url("c")]);
  await expect(page.locator("#continue-row button").first()).toContainText("Beta");
});
