import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", acceptDownloads: true });

// #346: одно нажатие S — один скриншот; в поле поиска «s»/«ы» вводятся.
// HLS через MSE даёт «чистый» кадр — канвас не tainted.
test("S makes exactly one screenshot and types into search", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  const playlist = "#EXTM3U\n#EXTINF:-1 group-title=\"Main\",Channel 1\nhttps://fixture.test/1.m3u8\n#EXTINF:-1 group-title=\"Main\",Sports\nhttps://fixture.test/2.m3u8\n";
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: playlist });
    if (url.endsWith(".m3u8")) {
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nfirst.ts\n#EXT-X-ENDLIST\n" });
    }
    return route.fulfill({ body: ts, contentType: "video/mp2t" });
  });
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "shot", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "shot");
  });
  await page.goto("/");
  await page.locator("#channel-list .channel-card").first().click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);

  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.locator("#video").focus();
  await page.keyboard.press("s");
  await expect.poll(() => downloads.length).toBe(1);
  await page.waitForTimeout(500);
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatch(/\.png$/);

  await page.locator("#search").focus();
  await page.keyboard.type("sы");
  await expect(page.locator("#search")).toHaveValue("sы");
  await page.waitForTimeout(500);
  expect(downloads).toHaveLength(1);
});
