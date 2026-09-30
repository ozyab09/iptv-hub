import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function checkBounds(page: Page): Promise<void> {
  const bounds = (await page.locator(".screens").boundingBox())!;
  const expand = (await page.locator("#btn-collapse-list").boundingBox())!;
  const hide = (await page.locator("#btn-hide-panel").boundingBox())!;
  for (const button of [expand, hide]) {
    expect(button.x).toBeGreaterThanOrEqual(bounds.x);
    expect(button.x + button.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(button.width).toBeGreaterThanOrEqual(36);
    expect(button.height).toBeGreaterThanOrEqual(36);
  }
  expect(hide.y).toBeGreaterThanOrEqual(expand.y + expand.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 1440]) {
    test(`кнопки свёрнутого списка (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => {
        localStorage.setItem("iptv-hub.theme.v1", theme);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "controls", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "controls");
      }, theme);
      await page.route("https://fixture.test/**", (route) => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Канал\nhttps://stream.invalid/live.mp4\n" }));
      await page.route("https://stream.invalid/**", (route) => route.fulfill({ status: 404 }));
      await page.goto("/");
      await page.locator("#channel-list .channel-card").first().click();
      const app = page.locator("#app");
      const expand = page.locator("#btn-collapse-list");
      await expand.click();
      await expect(app).toHaveClass(/list-collapsed/);
      await checkBounds(page);
      await expand.focus();
      await page.keyboard.press("Tab");
      await expect(page.locator("#btn-hide-panel")).toBeFocused();
      expect(await page.locator("#btn-hide-panel").evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      await page.keyboard.press("Enter");
      await expect(app).toHaveClass(/panel-hidden/);
      const restoreBounds = (await page.locator("#btn-restore-panel").boundingBox())!;
      const titleBounds = (await page.locator(".now-info").boundingBox())!;
      expect(restoreBounds.x + restoreBounds.width).toBeLessThanOrEqual(titleBounds.x);
      await page.locator("#video-stage").evaluate((el) => el.classList.add("idle"));
      expect(await page.locator("#btn-restore-panel").evaluate((el) => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (getComputedStyle(node).opacity === "0") return false;
        }
        return true;
      })).toBe(true);
      await page.locator("#btn-restore-panel").click();
      await expect(app).not.toHaveClass(/panel-hidden/);
      await checkBounds(page);
      await page.reload();
      await page.locator("#channel-list .channel-card").first().click();
      await expect(app).toHaveClass(/list-collapsed/);
      await checkBounds(page);
      await expand.click();
      await expect(app).not.toHaveClass(/list-collapsed/);
      await page.keyboard.press("c");
      await expect(app).toHaveClass(/list-collapsed/);
      await checkBounds(page);
      expect(await page.evaluate(() => localStorage.getItem("iptv-hub.list-collapsed.v1"))).toBe("1");
      await page.locator("#btn-hide-panel").click();
      await page.keyboard.press("c");
      await expect(app).not.toHaveClass(/panel-hidden/);
      await checkBounds(page);
    });
  }
}
