import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [320, 390, 480]) {
  for (const theme of ["light", "dark"]) {
    test(`дека внутри кадра и над нижней панелью (${width}px, ${theme})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const now = Date.now();
      const xmlDate = (time: number) => new Date(time).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
      const mp4 = readFileSync("tests/fixtures/recording.mp4");
      await page.addInitScript((value) => {
        localStorage.setItem("iptv-hub.theme.v1", value);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "t", name: "Тест", playlistUrl: "https://fixture.test/list.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "t");
      }, theme);
      await page.route("https://fixture.test/**", (route) => {
        const url = route.request().url();
        if (url.endsWith("list.m3u")) return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="tv",Тестовый канал\nhttps://fixture.test/stream.mp4\n' });
        if (url.endsWith("epg.xml")) return route.fulfill({ body: `<tv><channel id="tv"><display-name>Тестовый канал</display-name></channel><programme channel="tv" start="${xmlDate(now - 300000)}" stop="${xmlDate(now + 600000)}"><title>Текущая передача</title></programme></tv>` });
        return route.fulfill({ contentType: "video/mp4", body: mp4 });
      });
      await page.goto("/");
      await page.locator("#channel-list .channel-card").click();
      await page.locator("#video").click();
      const stage = page.locator("#video-stage");
      await expect(page.locator("#player-bar")).toHaveClass(/open/);
      await expect(page.locator("#prog-start")).not.toBeEmpty();
      await stage.hover();
      const frame = (await stage.boundingBox())!;
      const transport = (await page.locator(".transport").boundingBox())!;
      expect(transport.x).toBeGreaterThanOrEqual(frame.x);
      expect(transport.x + transport.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(transport.y).toBeGreaterThanOrEqual(frame.y);
      const topActions = (await page.locator(".video .top-actions").boundingBox())!;
      expect(topActions.y + topActions.height).toBeLessThanOrEqual(transport.y);
      const bottom = (await page.locator(".video .volume").boundingBox())!;
      expect(transport.y + transport.height).toBeLessThanOrEqual(bottom.y);
      const scrub = (await page.locator(".scrub-row").boundingBox())!;
      expect(transport.y + transport.height).toBeLessThanOrEqual(scrub.y);
      const buttons = page.locator(".transport button");
      await expect(buttons).toHaveCount(7);
      const order = ["btn-prev", "btn-seek-back", "btn-pause", "btn-seek-fwd", "btn-next"];
      expect(await buttons.evaluateAll((els) => els.slice(0, 5).map((el) => el.id))).toEqual(order);
      const leftEdges = await buttons.evaluateAll((els) => els.slice(0, 5).map((el) => el.getBoundingClientRect().left));
      expect(leftEdges).toEqual([...leftEdges].sort((a, b) => a - b));
      for (const button of await buttons.all()) {
        await expect(button).toBeVisible();
        const bounds = (await button.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(frame.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(frame.x + frame.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(frame.y + frame.height);
        expect(await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === el;
        })).toBe(true);
      }
      await page.locator("#btn-pause").click();
      await page.locator("#btn-sleep").click();
      await expect(page.locator("#sleep-menu")).toBeVisible();
      await page.locator("#btn-sleep").click();
      await page.screenshot({ path: testInfo.outputPath("mobile-transport.png") });
    });
  }
}
