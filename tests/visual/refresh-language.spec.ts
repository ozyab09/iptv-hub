import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", locale: "en-US" });
test("refresh and hidden HTTP notices are stored in the current language and change on screen", async ({ page }) => {
  let changed = false;
  await page.route("https://fixture.test/list.m3u", (route) => route.fulfill({ body: `#EXTM3U\n#EXTINF:-1,${changed ? "Beta" : "Alpha"}\nhttps://fixture.test/live.mp4\n#EXTINF:-1,HTTP\nhttp://public.test/blocked.mp4\n${changed ? "#EXTINF:-1,Gamma\nhttps://fixture.test/other.mp4\n" : ""}` }));
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "One", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  });
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  const notifications = () => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.notifications.v1") ?? "[]").map((n: { text: string }) => n.text) as string[]);
  expect((await notifications()).some((text) => text.startsWith("Hidden HTTP channels: 1."))).toBe(true);
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
  changed = true;
  await page.locator("#btn-refresh-now").click();
  await expect.poll(notifications).toContain("Playlist updated: +1, changed: 1. Channels: 2, no programmes");
  await page.locator("#notif-bell").click();
  await expect(page.locator("#notif-list")).toContainText("Playlist updated: +1, changed: 1");
  await page.locator('[data-language="ru"]').click();
  await expect(page.locator("#notif-list")).toContainText("Плейлист обновлён: +1, изменено: 1");
  await page.locator("#btn-refresh-now").click();
  await expect.poll(notifications).toContain("Плейлист проверён: без изменений. Каналов: 2, передач нет");
});
