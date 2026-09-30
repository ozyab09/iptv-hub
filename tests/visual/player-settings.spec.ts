import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`настройки плеера: сохранение, валидация, сброс (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{
        id: "test", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null,
      }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "test");
    });
    await page.route("https://fixture.test/**", (route) => route.fulfill({ body: "#EXTM3U\n" }));
    await page.goto("/");
    await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Настройки", visible: true }).first().click();
    const buffer = page.locator("#player-buffer");
    const latency = page.locator("#player-low-latency");
    const timeout = page.locator("#player-diagnostics-timeout");
    const submit = page.locator('#player-settings-form button[type="submit"]');
    await expect(buffer).toHaveValue("30");
    await expect(latency).not.toBeChecked();
    await expect(timeout).toHaveValue("8");
    await buffer.fill("120");
    await latency.check();
    await timeout.fill("15");
    await submit.click();
    await expect(page.locator("#player-settings-status")).toContainText("Сохранено");
    await page.reload();
    await expect(buffer).toHaveValue("120");
    await expect(latency).toBeChecked();
    await expect(timeout).toHaveValue("15");
    await buffer.fill("601");
    await submit.click();
    expect(await buffer.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.player-settings.v1")!).maxBufferLength)).toBe(120);
    await page.locator("#player-settings-reset").click();
    await expect(buffer).toHaveValue("30");
    await expect(latency).not.toBeChecked();
    await expect(timeout).toHaveValue("8");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
