import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  test(`Auto открывает варианты HLS (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const base = "https://fixture.test/";
    await page.route(`${base}**`, (route) => {
      const url = route.request().url();
      if (url.endsWith("playlist.m3u")) return route.fulfill({ body: `#EXTM3U\n#EXTINF:-1,Тест HLS\n${base}master.m3u8\n` });
      if (url.endsWith("master.m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=854x480,CODECS="avc1.42e01e"\n${base}480.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,CODECS="avc1.42e01e"\n${base}720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080,CODECS="avc1.42e01e"\n${base}1080.m3u8\n` });
      // Манифест вариантов нужен для меню; декодирование медиасегментов здесь не проверяем.
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10,\nsegment.ts\n#EXT-X-ENDLIST\n" });
    });
    await page.addInitScript(() => {
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "quality", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "quality");
    });
    await page.goto("/");
    await page.locator("#channel-list .channel-card").first().click();
    if (width < 1024) await page.locator("#now-title").click();
    const button = page.locator("#quality-btn");
    const menu = page.locator("#quality-menu");
    await expect(button).toBeEnabled();
    await button.click();
    await expect(menu).toBeVisible();
    await expect(menu.locator(".menu-item")).toHaveCount(4);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await menu.locator(".menu-item").filter({ hasText: "1080" }).click();
    await expect(menu).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await page.locator("#now-title").click();
    await expect(menu).toBeHidden();
    await button.click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await button.click();
    await page.goBack();
    await expect(menu).toBeHidden();
  });
}
