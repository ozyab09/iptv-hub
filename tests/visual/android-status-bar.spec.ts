import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

test("Android bridge follows theme and expanded player across resize and closing", async ({ page }) => {
  await page.addInitScript(() => {
    const host = window as Window & { IPTVHubStatusBar?: { postMessage(value: string): void } };
    host.IPTVHubStatusBar = { postMessage: value => document.documentElement.dataset.statusBar = value };
    localStorage.setItem("iptv-hub.theme.v1", "light");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "One", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  });
  await page.route("https://fixture.test/playlist.m3u", route => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://fixture.test/video.mp4" }));
  const video = readFileSync("tests/fixtures/recording.mp4");
  await page.route("https://fixture.test/video.mp4", route => route.fulfill({ body: video, contentType: "video/mp4" }));
  await page.goto("/");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-status-bar", "light");
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#player-bar")).toBeVisible();
  await expect(root).toHaveAttribute("data-status-bar", "light");
  await page.locator("#now-title").click();
  await expect(page.locator("#player-bar")).toHaveClass(/open/);
  await expect(root).toHaveAttribute("data-status-bar", "dark");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(root).toHaveAttribute("data-status-bar", "light");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(root).toHaveAttribute("data-status-bar", "dark");
  await page.locator("#btn-close-player").click();
  await expect(root).toHaveAttribute("data-status-bar", "light");
  await page.reload();
  await expect(root).toHaveAttribute("data-status-bar", "light");
});
