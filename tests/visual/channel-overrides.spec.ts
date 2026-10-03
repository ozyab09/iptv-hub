import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`алиасы, скрытие, диплинк и сброс (${theme}, ${width}px)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const media = readFileSync("tests/fixtures/recording.mp4");
      const date = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
      const now = Date.now();
      const xml = `<tv><channel id="a"><display-name>Alpha</display-name></channel><programme channel="a" start="${date(now - 60000)}" stop="${date(now + 3600000)}"><title>News bulletin</title></programme></tv>`;
      await page.route("https://fixture.test/**", (route) => {
        const url = route.request().url();
        if (url.endsWith(".xml")) return route.fulfill({ body: xml });
        if (url.endsWith(".mp4")) return route.fulfill({ contentType: "video/mp4", body: media });
        return route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://fixture.test/a.mp4\n#EXTINF:-1,Beta\nhttps://fixture.test/b.mp4\n" });
      });
      await page.addInitScript((theme) => {
        // Сохраняем пользовательские изменения при reload.
        if (!localStorage.getItem("iptv-hub.playlists.v1")) {
          localStorage.setItem("iptv-hub.theme.v1", theme);
          localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([
            { id: "one", name: "Первый", playlistUrl: "https://fixture.test/one.m3u", epgUrl: "https://fixture.test/epg.xml" },
            { id: "two", name: "Второй", playlistUrl: "https://fixture.test/two.m3u", epgUrl: "https://fixture.test/epg.xml" },
          ]));
          localStorage.setItem("iptv-hub.active-playlist.v1", "one");
        }
      }, theme);
      await page.goto("/");
      const rows = page.locator("#channel-list .channel-card");
      await expect(rows.first()).toContainText("News bulletin");
      await rows.first().click();
      const source = await page.locator("#video").getAttribute("src");
      await rows.first().locator("[data-channel-edit]").click();
      await page.locator("#channel-alias").fill("Мой канал");
      await page.screenshot({ path: testInfo.outputPath("channel-editor.png") });
      await page.locator('#channel-editor button[type="submit"]').click();
      await expect(rows.first()).toContainText("Мой канал");
      await expect(rows.first()).toContainText("News bulletin");
      await expect(page.locator("#now-title")).toHaveText("Мой канал");
      await expect(page.locator("#video")).toHaveAttribute("src", source!);
      await page.locator("#btn-next").dispatchEvent("click");
      await expect(page.locator("#now-title")).toHaveText("Beta");
      await page.locator("#btn-prev").dispatchEvent("click");
      await expect(page.locator("#now-title")).toHaveText("Мой канал");
      await page.locator("#search").fill("мой канал");
      await expect(rows).toHaveCount(1);
      await page.locator("#search").fill("news");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("Мой канал · News bulletin");
      await page.locator("#search").fill("");
      await rows.first().click({ button: "right" });
      await expect(page.locator("#channel-alias")).toHaveValue("Мой канал");
      await page.keyboard.press("Escape");
      await expect(page.locator("#channel-editor")).not.toBeVisible();
      await expect(page.locator("#now-title")).toHaveText("Мой канал");
      await rows.first().locator("[data-channel-edit]").click();
      await page.locator("#channel-hidden").check();
      await page.locator('#channel-editor button[type="submit"]').click();
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("Beta");
      await expect(page.locator("#continue-row")).not.toContainText("Мой канал");
      await page.locator("#search").fill("news");
      await expect(rows).toHaveCount(0);
      await page.goto("/?ch=" + encodeURIComponent("https://fixture.test/a.mp4"));
      await expect(page.locator("#now-title")).toHaveText("Мой канал");
      await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
      await expect(rows).toHaveCount(1);
      await page.locator("#pl-switch-btn").click();
      await page.locator("#pl-switch-menu button").filter({ hasText: "Второй" }).click();
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText("Alpha");
      await page.locator("#pl-switch-btn").click();
      await page.locator("#pl-switch-menu button").filter({ hasText: "Первый" }).click();
      await expect(rows).toHaveCount(1);
      await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Настройки", visible: true }).first().click();
      await page.locator("#channel-overrides-reset").click();
      await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Каналы", visible: true }).first().click();
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText("Alpha");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
