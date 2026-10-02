import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1280, 1440]) {
    test(`выбор канала сохраняет прокрутку (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const playlist = "#EXTM3U\n" + Array.from({ length: 150 }, (_, i) =>
        `#EXTINF:-1 group-title="${i < 120 ? "Main" : "Other"}",Channel ${String(i).padStart(3, "0")}\nhttps://fixture.test/${i}.mp4\n`).join("");
      await page.route("https://fixture.test/**", (route) => route.request().url().endsWith("playlist.m3u")
        ? route.fulfill({ body: playlist }) : route.fulfill({ status: 404 }));
      await page.addInitScript((theme) => {
        localStorage.setItem("iptv-hub.theme.v1", theme);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "scroll", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "scroll");
      }, theme);
      await page.goto("/");
      const list = page.locator("#channel-list");
      const row = (index: number) => list.locator(`[data-channel-url="https://fixture.test/${index}.mp4"]`);
      await row(0).click();
      const selectAtScroll = async (): Promise<void> => {
        await list.evaluate((el) => { el.scrollTop = 1440; });
        await expect(row(20)).toBeInViewport();
        const before = await list.evaluate((el) => el.scrollTop);
        await row(20).click();
        await expect(page.locator("#now-title")).toHaveText("Channel 020");
        await expect(row(20)).toHaveClass(/\bon\b/);
        expect(await list.evaluate((el) => el.scrollTop)).toBe(before);
      };
      await selectAtScroll();
      if (width >= 1024) {
        await page.locator("#btn-next").click();
        await expect(page.locator("#now-title")).toHaveText("Channel 021");
        expect(await list.evaluate((el) => el.scrollTop)).toBe(1440);
        await page.locator("#btn-collapse-list").click();
        await expect(list).toBeHidden();
        await page.locator("#btn-restore-panel").click();
        expect(await list.evaluate((el) => el.scrollTop)).toBe(1440);
      }
      await page.locator("#search").fill("Channel 14");
      await expect(page.locator("#view-count")).toHaveText("10");
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
      await expect(row(140)).toBeVisible();
      await page.locator("#search").fill("");
      await list.evaluate((el) => { el.scrollTop = 1440; });
      if (width >= 1024) {
        await page.locator("#btn-categories").click();
        await page.locator("#cat-menu .menu-item").filter({ hasText: "Other" }).click();
      } else {
        await page.locator("#categories .chip").filter({ hasText: "Other" }).click();
      }
      await expect(page.locator("#view-count")).toHaveText("30");
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
      await expect(row(120)).toBeVisible();
      await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Недавние", visible: true }).first().click();
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
      await expect(list.locator(".channel-card").first()).toBeVisible();
    });
  }
}
