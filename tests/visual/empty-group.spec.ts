import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("empty playlist groups stay named with legacy group preferences", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://fixture.test/list.m3u", (route) => route.fulfill({
    body: '#EXTM3U\n#EXTINF:-1 group-title="",Empty group\nhttps://fixture.test/empty.mp4\n',
  }));
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "one", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    localStorage.setItem("iptv-hub.groups.v1:one", JSON.stringify({ hidden: [""], order: [""] }));
  });
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toContainText("Empty group");
  await expect(page.locator("#cat-menu .cat-label")).toHaveText(["All", "Основные"]);
  await expect(page.locator("#categories .chip").filter({ hasText: "Основные" })).toHaveCount(1);
  await page.locator("#side-nav button").filter({ hasText: "Settings", visible: true }).click();
  await expect(page.locator("#group-preferences .item-label")).toHaveText(["Основные"]);
  await page.reload();
  await expect(page.locator("#group-preferences .item-label")).toHaveText(["Основные"]);
});
