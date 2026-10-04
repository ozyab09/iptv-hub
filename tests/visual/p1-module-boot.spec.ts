import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });

// P1 создаёт DOM-модули до boot: сохранённый экран и локализация не должны
// вызвать их до инициализации const. tsc такие TDZ-ошибки не замечает.
for (const view of ["channels", "settings", "recordings"]) {
  test(`P1 module initialization with saved ${view} view`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://fixture.test/list.m3u", route => route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 group-title="News",Alpha\nhttps://fixture.test/a.mp4' }));
    await page.addInitScript(view => {
      localStorage.setItem("iptv-hub.language.v1", "en");
      localStorage.setItem("iptv-hub.view.v1", view);
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "One", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    }, view);
    await page.goto("/");
    await expect(page.locator("#pl-switch-name")).toHaveText("One");
    if (view === "channels") {
      await expect(page.locator("#channel-list .channel-hit")).toHaveAccessibleName("Alpha");
      await page.locator("#search").focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator("#channel-list .channel-hit")).toBeFocused();
    } else if (view === "settings") {
      // С загруженным плейлистом boot выводит из настроек к каналам.
      await expect(page.locator("#channel-list .channel-hit")).toHaveAccessibleName("Alpha");
      await page.locator("#side-nav button").filter({ hasText: "Settings" }).click();
      await expect(page.locator("#player-settings-form")).toBeVisible();
      await expect(page.locator("#btn-export")).toBeVisible();
    } else {
      await expect(page.locator("#recordings-screen")).toBeVisible();
      await expect(page.locator("#recordings-empty")).toBeVisible();
    }
    await page.reload();
    await expect(page.locator("#pl-switch-name")).toHaveText("One");
    expect(errors).toEqual([]);
  });
}

test("cross-tab module applies native storage events to theme and favorites", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("https://fixture.test/list.m3u", route => route.fulfill({ body: '#EXTM3U\n#EXTINF:-1,Alpha\nhttps://fixture.test/a.mp4' }));
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.theme.v1", "dark");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "One", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  });
  await page.reload();
  const other = await context.newPage();
  other.on("pageerror", error => errors.push(error.message));
  await other.goto(page.url());
  await expect(other.locator("#channel-list .channel-hit")).toHaveAccessibleName("Alpha");
  await other.locator("#btn-theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await other.locator("#channel-list .star").click();
  await expect(page.locator("#channel-list .star")).toHaveAccessibleName("Remove from favorites");
  await other.locator("#channel-list .star").click();
  await expect(page.locator("#channel-list .star")).toHaveAccessibleName("Add to favorites");
  expect(errors).toEqual([]);
});
