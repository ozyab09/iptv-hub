import { expect, test } from "@playwright/test";

for (const [theme, width] of [["light", 390], ["light", 1440], ["dark", 390], ["dark", 1440]] as const) {
  test(`настройки плеера: оформление, сохранение, валидация, сброс (${theme}, ${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem("iptv-hub.theme.v1", theme), theme);
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
    await page.locator("#player-settings-form").screenshot({ path: `test-results/player-settings-${theme}-${width}.png` });
    for (const field of [buffer, timeout]) {
      const style = await field.evaluate((el) => {
        const s = getComputedStyle(el);
        const parent = getComputedStyle(el.closest(".input")!);
        return { background: s.backgroundColor, border: s.borderTopWidth, color: s.color, parentColor: parent.color, font: s.fontFamily, bodyFont: getComputedStyle(document.body).fontFamily };
      });
      expect(style.background).toBe("rgba(0, 0, 0, 0)");
      expect(style.border).toBe("0px");
      expect(style.color).toBe(style.parentColor);
      expect(style.font).toBe(style.bodyFont);
    }
    await buffer.focus();
    await page.keyboard.press("ArrowUp");
    await expect(buffer).toHaveValue("31");
    await page.keyboard.press("ArrowDown");
    await expect(buffer).toHaveValue("30");
    await page.keyboard.press("Tab");
    await expect(latency).toBeFocused();
    const track = latency.locator("+ .player-switch-track");
    await expect(track).toBeVisible();
    expect(await track.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe("2px");
    const offColor = await track.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.keyboard.press("Space");
    await expect(latency).toBeChecked();
    await expect.poll(() => track.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(offColor);
    await page.keyboard.press("Tab");
    await expect(timeout).toBeFocused();
    await latency.uncheck();
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
