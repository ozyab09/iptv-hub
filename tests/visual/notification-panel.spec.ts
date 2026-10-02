import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [320, 360, 390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`уведомления внутри экрана: очистка и закрытие (${width}px, ${theme})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((value) => {
        localStorage.setItem("iptv-hub.theme.v1", value);
        localStorage.setItem("iptv-hub.language.v1", "ru");
        localStorage.setItem("iptv-hub.notifications.v1", JSON.stringify([{ id: 1, text: "Плейлист проверён: без изменений. Каналов: 1, передач нет", at: 1000, read: false }]));
      }, theme);
      await page.goto("/");
      const bell = page.locator("#notif-bell");
      const panel = page.locator("#notif-panel");
      await bell.click();
      await expect(panel).toBeVisible();
      await expect(bell).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#notif-list")).toContainText("Плейлист проверён");
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (width >= 720) {
        const anchor = (await page.locator("#notif-bell-wrap").boundingBox())!;
        expect(bounds.x + bounds.width).toBeCloseTo(anchor.x + anchor.width, 0);
        expect(bounds.y).toBeCloseTo(anchor.y + anchor.height + 6, 0);
      }
      await page.locator("#notif-clear").click();
      await expect(panel).toBeVisible();
      await expect(page.locator("#notif-list")).toHaveText("Пока ничего не случилось");
      await page.screenshot({ path: testInfo.outputPath("notification-panel.png") });
      await page.locator("#btn-theme").click();
      await expect(panel).toBeHidden();
      await expect(bell).toHaveAttribute("aria-expanded", "false");
      await bell.click();
      await expect(panel).toBeVisible();
      await bell.click();
      await expect(panel).toBeHidden();
      expect(await page.evaluate(() => localStorage.getItem("iptv-hub.notifications.v1"))).toBeNull();
    });
  }
}
