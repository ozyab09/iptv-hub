import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// #450: пустая библиотека записей переводится при запуске и смене языка.
test("empty recordings library follows the interface language", async ({ page }) => {
  await page.route("https://fixture.test/**", (route) => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://fixture.test/a.m3u8\n" }));
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.view.v1", "recordings");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "rec", name: "TV", playlistUrl: "https://fixture.test/p.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "rec");
  });
  await page.goto("/");
  const empty = page.locator("#recordings-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toHaveText("No recordings yet. Use the player’s record button to add recordings here.");

  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
  await page.locator('[data-language="ru"]').click();
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Записи", visible: true }).first().click();
  await expect(empty).toHaveText("Записей пока нет. Кнопка записи в плеере — записи появятся здесь.");
});
