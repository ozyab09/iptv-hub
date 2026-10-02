import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("live HLS retains a three-minute pause and returns to live", async ({ page }) => {
  test.setTimeout(120_000);
  let head = 6;
  const segment = readFileSync("tests/fixtures/recording.mpegts");
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "live", name: "Live", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "live");
  });
  await page.route("https://fixture.test/**", (route) => {
    if (route.request().url().endsWith("list.m3u")) return route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Live\nhttps://fixture.test/live.m3u8\n" });
    if (route.request().url().endsWith("live.m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=20000000\nmedia.m3u8\n" });
    if (route.request().url().endsWith(".ts")) return route.fulfill({ contentType: "video/mp2t", body: segment });
    const start = Math.max(0, head - 6);
    const entries = Array.from({ length: head - start }, (_, i) => `#EXT-X-DISCONTINUITY\n#EXTINF:4,\n${start + i}.ts`).join("\n");
    return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:${start}\n#EXT-X-DISCONTINUITY-SEQUENCE:${start}\n${entries}\n` });
  });
  await page.goto("/");
  await page.locator("#channel-list .channel-card").click();
  const video = page.locator("#video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.1);
  await page.locator("#btn-pause").click();
  const pausedAt = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  for (let i = 0; i < 45; i++) {
    head++;
    await page.clock.fastForward(4000);
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0)).toBeGreaterThan(head * 4 - 4.5);
  }
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(pausedAt, 0);
  await page.locator("#btn-pause").click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  const resumedAt = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  expect(resumedAt).toBeLessThan(pausedAt + 5);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(pausedAt + 0.5);
  await page.locator("#btn-seek-fwd").click();
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(resumedAt + 10);
  await page.locator("#btn-seek-back").click();
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(resumedAt + 5);
  await page.locator("#btn-live").click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(head * 4 - 20);
  await expect(video).toHaveJSProperty("paused", false);
  await expect(video).toHaveJSProperty("videoWidth", 160);
});

test("native MP4 keeps pause, resume and finite seeking", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "native", name: "Native", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "native");
  });
  const bytes = readFileSync("tests/fixtures/recording.mp4");
  await page.route("https://fixture.test/**", (route) => route.request().url().endsWith(".mp4")
    ? route.fulfill({ contentType: "video/mp4", body: bytes })
    : route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Native\nhttps://fixture.test/video.mp4\n" }));
  await page.goto("/");
  await page.locator("#channel-list .channel-card").click();
  const video = page.locator("#video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.1);
  await page.locator("#btn-pause").click();
  await expect(video).toHaveJSProperty("paused", true);
  const time = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  await page.locator("#btn-pause").click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(time + 0.2);
  await page.locator("#btn-seek-back").click();
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(0.5);
  await expect(video).toHaveJSProperty("videoWidth", 160);
});
