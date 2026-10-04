import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("single-quoted categories retain their names and filter channels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://fixture.test/list.m3u", (route) => route.fulfill({
    body: "#EXTM3U\n#EXTINF:-1 group-title='_Best',Best channel\nhttps://fixture.test/best.mp4\n#EXTINF:-1 group-title=\"Other\",Other channel\nhttps://fixture.test/other.mp4\n",
  }));
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "one", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  });
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
  await page.locator("#categories .chip").filter({ hasText: "_Best" }).click();
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await expect(page.locator("#channel-list .channel-card")).toContainText("Best channel");
  await expect(page.locator("#view-count")).toHaveText("1");
  await page.locator("#side-nav button").filter({ hasText: "Settings", visible: true }).click();
  await expect(page.locator("#group-preferences .item-label")).toContainText(["_Best", "Other"]);
});
