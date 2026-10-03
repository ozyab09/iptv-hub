import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
for (const supported of [true, false]) {
  for (const width of [390, 1440]) {
    test(`mobile quality settings: support=${supported}, width=${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((supported) => {
        Object.defineProperty(navigator, "connection", { value: supported ? Object.assign(new EventTarget(), { type: "cellular", effectiveType: "4g" }) : undefined, configurable: true });
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "test", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "test");
      }, supported);
      await page.route("https://fixture.test/**", (route) => route.fulfill({ body: "#EXTM3U\n" }));
      await page.goto("/");
      await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Настройки", visible: true }).first().click();
      const enabled = page.locator("#player-mobile-quality");
      const height = page.locator("#player-mobile-height");
      if (!supported) {
        await expect(enabled).toBeHidden();
        await expect(height).toBeHidden();
        await expect(page.locator("#player-mobile-unsupported")).toBeVisible();
        return;
      }
      await expect(enabled).not.toBeChecked();
      await expect(height).toHaveValue("720");
      await enabled.check();
      await height.selectOption("480");
      await page.locator('#player-settings-form button[type="submit"]').click();
      await page.reload();
      await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Настройки", visible: true }).first().click();
      await expect(enabled).toBeChecked();
      await expect(height).toHaveValue("480");
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.player-settings.v1")!).limitMobileQuality)).toBe(true);
      await page.locator("#player-settings-reset").click();
      await expect(enabled).not.toBeChecked();
      await expect(height).toHaveValue("720");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
