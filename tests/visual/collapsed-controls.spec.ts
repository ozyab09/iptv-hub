import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function checkCollapsed(page: Page): Promise<void> {
  await expect(page.locator(".screens")).toBeHidden();
  await expect(page.locator(".sidebar")).toBeVisible();
  expect(await page.locator("#app").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ")[1])).toBe("0px");
  await expect(page.locator("#btn-restore-panel")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const theme of ["light", "dark"]) {
  for (const width of [1024, 1280, 1440]) {
    test(`список полностью скрыт и возвращается (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => {
        localStorage.setItem("iptv-hub.theme.v1", theme);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "controls", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "controls");
      }, theme);
      const playlist = "#EXTM3U\n" + Array.from({ length: 150 }, (_, i) =>
        `#EXTINF:-1 group-title="${i < 120 ? "Main" : "Other"}",Channel ${String(i).padStart(3, "0")}\nhttps://fixture.test/${i}.mp4\n`).join("");
      await page.route("https://fixture.test/**", (route) => route.request().url().endsWith("playlist.m3u")
        ? route.fulfill({ body: playlist }) : route.fulfill({ status: 404 }));
      await page.goto("/");
      const list = page.locator("#channel-list");
      await list.locator(".channel-card").first().click();
      await page.locator("#btn-categories").click();
      await page.locator("#cat-menu .menu-item").filter({ hasText: "Other" }).click();
      await expect(page.locator("#view-count")).toHaveText("30");
      await list.evaluate((el) => { el.scrollTop = 720; });
      const before = await list.evaluate((el) => el.scrollTop);
      const playerWidth = (await page.locator("#player-bar").boundingBox())!.width;
      const app = page.locator("#app");
      await page.locator("#btn-collapse-list").click();
      await checkCollapsed(page);
      await expect(page.locator("#btn-restore-panel")).toBeFocused();
      expect((await page.locator("#player-bar").boundingBox())!.width).toBe(playerWidth + 368);
      await page.screenshot({ path: test.info().outputPath("collapsed-list.png") });
      await page.locator("#video-stage").evaluate((el) => el.classList.add("idle"));
      expect(await page.locator("#btn-restore-panel").evaluate((el) => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (getComputedStyle(node).opacity === "0") return false;
        }
        return true;
      })).toBe(true);
      await page.locator("#btn-restore-panel").click();
      await expect(app).not.toHaveClass(/list-collapsed/);
      await expect(page.locator("#view-count")).toHaveText("30");
      expect(await list.evaluate((el) => el.scrollTop)).toBe(before);
      await expect(list.locator('[data-channel-url="https://fixture.test/130.mp4"]')).toBeInViewport();
      await expect(page.locator("#btn-collapse-list")).toBeFocused();
      await page.keyboard.press("c");
      await checkCollapsed(page);
      await page.keyboard.press("c");
      await expect(list).toBeVisible();
      expect(await list.evaluate((el) => el.scrollTop)).toBe(before);
      await page.keyboard.press("c");
      await page.locator("#btn-hide-panel").focus();
      await expect(page.locator("#btn-hide-panel")).toBeFocused();
      expect(await page.locator("#btn-hide-panel").evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      await page.keyboard.press("Enter");
      await expect(app).toHaveClass(/panel-hidden/);
      await expect(page.locator(".sidebar")).toBeHidden();
      await page.keyboard.press("c");
      await expect(app).not.toHaveClass(/panel-hidden|list-collapsed/);
      expect(await list.evaluate((el) => el.scrollTop)).toBe(before);
      await page.locator("#btn-collapse-list").click();
      expect(await page.evaluate(() => localStorage.getItem("iptv-hub.list-collapsed.v1"))).toBe("1");
      await page.reload();
      await list.locator(".channel-card").first().click();
      await checkCollapsed(page);
      await page.locator("#btn-hide-panel").click();
      await page.locator("#btn-restore-panel").click();
      await expect(list).toBeVisible();
      await expect(page.locator(".sidebar")).toBeVisible();
    });
  }
}
