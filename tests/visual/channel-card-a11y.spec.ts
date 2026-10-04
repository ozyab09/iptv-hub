import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// #351: карточка канала — контейнер без вложенных кнопок; Tab проходит
// запуск, звезду и редактирование отдельными стопами, Enter запускает канал.
for (const width of [390, 1440]) {
  test(`channel card has no nested buttons and separate tab stops (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const playlist = "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://fixture.test/a.mp4\n#EXTINF:-1,Beta\nhttps://fixture.test/b.mp4\n";
    await page.route("https://fixture.test/**", (route) => route.request().url().endsWith("playlist.m3u")
      ? route.fulfill({ body: playlist }) : route.fulfill({ status: 404 }));
    await page.addInitScript(() => {
      localStorage.setItem("iptv-hub.language.v1", "en");
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "a11y", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "a11y");
    });
    await page.goto("/");
    const card = page.locator('#channel-list [data-channel-url="https://fixture.test/a.mp4"]');
    await expect(card).toBeVisible();
    expect(await page.locator("#channel-list button button").count()).toBe(0);
    await expect(card).toHaveJSProperty("tagName", "DIV");
    const box = await card.boundingBox();
    expect(Math.round(box!.height)).toBe(72);

    const hit = card.locator(".channel-hit");
    await expect(hit).toHaveAccessibleName("Alpha");
    await hit.focus();
    await page.keyboard.press("Tab");
    await expect(card.getByRole("button", { name: "Add to favorites" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(card.locator("[data-channel-edit]")).toBeFocused();
    const star = await card.getByRole("button", { name: "Add to favorites" }).boundingBox();
    expect(star!.width).toBeGreaterThanOrEqual(32);

    await hit.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#now-title")).toHaveText("Alpha");
  });
}
