import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 1440]) {
    test(`меню категорий (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const long = "Документальные и познавательные каналы";
      const groups = [long, ...Array.from({ length: 20 }, (_, i) => `Категория ${i + 1}`)];
      const playlist = "#EXTM3U\n" + groups.map((g, i) =>
        `#EXTINF:-1 group-title="${g}",Канал ${String(i).padStart(2, "0")}\nhttps://fixture.test/${i}.mp4\n`).join("");
      await page.route("https://fixture.test/**", (route) => route.request().url().endsWith("playlist.m3u")
        ? route.fulfill({ body: playlist }) : route.fulfill({ status: 404 }));
      await page.addInitScript((theme) => {
        localStorage.setItem("iptv-hub.theme.v1", theme);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "categories", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "categories");
      }, theme);
      await page.goto("/");
      await page.locator("#channel-list .channel-card").first().click();
      const trigger = page.locator("#btn-categories");
      const menu = page.locator("#cat-menu");
      await trigger.click();
      await expect(menu).toBeVisible();
      const items = menu.locator(".menu-item");
      await expect(items).toHaveCount(22);
      const first = items.first();
      const css = await first.evaluate((el) => {
        const s = getComputedStyle(el);
        return { font: s.fontFamily, border: s.borderWidth };
      });
      expect(css.font).toContain("Onest");
      expect(css.border).toBe("0px");
      await trigger.hover();
      await expect(first).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      for (let i = 0; i < 22; i++) expect((await items.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(40);
      const named = items.filter({ hasText: long });
      await named.scrollIntoViewIfNeeded();
      expect(await named.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: `test-results/category-menu-${theme}-${width}.png` });
      await first.focus();
      await page.keyboard.press("Tab");
      await expect(named).toBeFocused();
      expect(await named.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      await page.keyboard.press("Enter");
      await expect(menu).toBeHidden();
      await expect(trigger).toHaveText(long);
      await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
      await trigger.click();
      await expect(menu.locator('[aria-selected="true"]')).toContainText(long);
      await page.locator("#now-title").click();
      await expect(menu).toBeHidden();
      // Проверяем общий сброс на реальных контейнерах остальных меню;
      // сетевой HLS и доступность дорожек к оформлению не относятся.
      const styles = await page.evaluate(() => ["quality-menu", "audio-menu", "subtitle-menu", "sleep-menu"].map((id) => {
        const item = document.createElement("button");
        item.className = "menu-item on";
        document.getElementById(id)!.append(item);
        const s = getComputedStyle(item);
        const result = { font: s.fontFamily, border: s.borderWidth, color: s.color, accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() };
        item.remove();
        return result;
      }));
      for (const s of styles) {
        expect(s.font).toContain("Onest");
        expect(s.border).toBe("0px");
        expect(s.color).toBe("rgb(255, 255, 255)");
      }
    });
  }
}
