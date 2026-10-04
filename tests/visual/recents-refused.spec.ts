import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// #356: канал, который плеер отказался запускать, не попадает в «Недавние».
test("refused channel stays out of recents, started one goes first", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mp4 = readFileSync("tests/fixtures/recording.mp4");
  await page.route("https://fixture.test/**", (route) => route.request().url().endsWith("playlist.m3u")
    ? route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Dash\nhttps://fixture.test/live.mpd\n#EXTINF:-1,Video\nhttps://fixture.test/v.mp4\n" })
    : route.fulfill({ body: mp4, contentType: "video/mp4" }));
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "rec", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "rec");
  });
  await page.goto("/");
  const recents = () => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recents.v1:rec") ?? "[]") as string[]);
  await page.locator('#channel-list [data-channel-url="https://fixture.test/live.mpd"]').click();
  await expect(page.locator("#toast")).toContainText("DASH");
  expect(await recents()).toEqual([]);

  await page.locator('#channel-list [data-channel-url="https://fixture.test/v.mp4"]').click();
  await expect.poll(recents).toEqual(["https://fixture.test/v.mp4"]);
  await page.locator('#channel-list [data-channel-url="https://fixture.test/live.mpd"]').click();
  await page.waitForTimeout(300);
  expect(await recents()).toEqual(["https://fixture.test/v.mp4"]);
});
