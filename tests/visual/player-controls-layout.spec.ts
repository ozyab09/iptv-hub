import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [320, 390, 844, 1024, 1280, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`информация сверху, транспорт между громкостью и качеством (${width}px, ${theme})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const ts = readFileSync("tests/fixtures/recording.mpegts");
      await page.addInitScript((value) => {
        localStorage.setItem("iptv-hub.theme.v1", value);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "p", name: "TV", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "p");
      }, theme);
      await page.route("https://fixture.test/**", (route) => {
        const url = route.request().url();
        if (url.endsWith("list.m3u")) return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1,Тестовый канал\nhttps://fixture.test/master.m3u8\n' });
        if (url.endsWith("master.m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=160x90,CODECS="avc1.42c00a,mp4a.40.2"\nstream.m3u8\n' });
        if (url.endsWith(".ts")) return route.fulfill({ contentType: "video/mp2t", body: ts });
        return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\n0.ts\n#EXT-X-ENDLIST\n' });
      });
      await page.goto("/");
      await page.locator("#channel-list .channel-card").click();
      if (width < 1024) {
        await expect(page.locator("#btn-pause")).toBeVisible();
        await expect(page.locator("#btn-guide")).toBeHidden();
        await expect(page.locator("#quality-btn")).toBeHidden();
        await page.locator("#video").click();
      }
      const stage = page.locator("#video-stage");
      await stage.hover();
      await expect(page.locator("#quality-btn")).toBeEnabled();
      await expect(page.locator(".top #btn-guide")).toBeVisible();
      await expect(page.locator(".top #player-status")).toHaveCount(1);
      const frame = (await stage.boundingBox())!;
      const transport = (await page.locator(".transport").boundingBox())!;
      const volume = (await page.locator(".volume").boundingBox())!;
      const right = (await page.locator(".video-actions-right").boundingBox())!;
      const title = (await page.locator("#now-title").boundingBox())!;
      const guide = (await page.locator("#btn-guide").boundingBox())!;
      expect(guide.x + guide.width).toBeLessThanOrEqual(title.x);
      if (await page.locator("#player-status").isVisible()) {
        const status = (await page.locator("#player-status").boundingBox())!;
        expect(status.x + status.width).toBeLessThanOrEqual(title.x);
      }
      if (frame.width >= 740) {
        expect(transport.y).toBeCloseTo(volume.y, 0);
        expect(transport.x).toBeGreaterThanOrEqual(volume.x + volume.width);
        expect(transport.x + transport.width).toBeLessThanOrEqual(right.x);
        expect(transport.x + transport.width / 2).toBeCloseTo((volume.x + volume.width + right.x) / 2, 0);
      } else {
        expect(transport.y + transport.height).toBeLessThanOrEqual(volume.y);
      }
      await page.locator("#btn-mute").focus();
      await page.keyboard.press("Tab");
      if (await page.locator("#volume-slider").isVisible()) await page.keyboard.press("Tab");
      await expect(page.locator("#btn-seek-back")).toBeFocused();
      await page.locator("#quality-btn").click();
      const menu = page.locator("#quality-menu");
      await expect(menu).toBeVisible();
      const menuBounds = (await menu.boundingBox())!;
      const scrub = (await page.locator(".scrub-row").boundingBox())!;
      if (frame.width >= 740) expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(transport.y);
      else expect(menuBounds.y).toBeGreaterThanOrEqual(scrub.y + scrub.height);
      expect(menuBounds.x).toBeGreaterThanOrEqual(frame.x);
      expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(frame.x + frame.width);
      await menu.locator(".menu-item").last().click();
      await expect(menu).toBeHidden();
      await page.locator("#btn-guide").click();
      await expect(page.locator("#guide-overlay")).toBeVisible();
      await page.locator("#guide-close").click();
      await stage.hover();
      await expect(stage).not.toHaveClass(/idle/);
      await expect.poll(() => page.locator(".video .top").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
      await page.screenshot({ path: testInfo.outputPath("player-controls.png") });
    });
  }
}
