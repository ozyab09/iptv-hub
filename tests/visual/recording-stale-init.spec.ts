import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// #347: init-сегмент fMP4-канала не должен попадать в запись следующего TS-канала.
test("TS recording after an fMP4 channel starts with a TS sync byte", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  const mp4 = readFileSync("tests/fixtures/recording.mp4");
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let initLoaded = false;
  const playlist = "#EXTM3U\n#EXTINF:-1 group-title=\"Main\",A fMP4\nhttps://fixture.test/a.m3u8\n#EXTINF:-1 group-title=\"Main\",B TS\nhttps://fixture.test/b.m3u8\n";
  await page.route("https://fixture.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: playlist });
    if (url.endsWith("a.m3u8")) {
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:4\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:4,\na1.m4s\n#EXT-X-ENDLIST\n" });
    }
    if (url.endsWith("init.mp4")) {
      initLoaded = true;
      return route.fulfill({ body: mp4, contentType: "video/mp4" });
    }
    if (url.endsWith(".m4s")) return route.fulfill({ body: mp4, contentType: "video/mp4" });
    if (url.endsWith("b.m3u8")) {
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nb1.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\nb2.ts\n#EXT-X-ENDLIST\n" });
    }
    if (url.endsWith("b2.ts")) await held;
    return route.fulfill({ body: ts, contentType: "video/mp2t" });
  });
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "init", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "init");
  });
  await page.goto("/");
  const cards = page.locator("#channel-list .channel-card");
  await cards.filter({ hasText: "A fMP4" }).click();
  await expect.poll(() => initLoaded).toBe(true);
  await page.waitForTimeout(300);

  await cards.filter({ hasText: "B TS" }).click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await page.locator("#btn-rec").dispatchEvent("click");
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  release();
  await page.waitForTimeout(1000);
  await page.locator("#btn-rec").dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1") ?? "[]").length)).toBe(1);

  const saved = await page.evaluate(async () => {
    const [meta] = JSON.parse(localStorage.getItem("iptv-hub.recordings.v1")!) as { id: string; ext: string }[];
    const dir = await navigator.storage.getDirectory();
    const file = await (await dir.getFileHandle(`done-${meta!.id}.${meta!.ext}`)).getFile();
    return { ext: meta!.ext, first: new Uint8Array(await file.slice(0, 1).arrayBuffer())[0] };
  });
  expect(saved).toEqual({ ext: "ts", first: 0x47 });
});
