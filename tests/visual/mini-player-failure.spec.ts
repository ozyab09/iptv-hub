import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [320, 390]) for (const theme of ["light", "dark"]) {
  test(`failed stream keeps mini player readable and expandable (${width}, ${theme})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route("https://fixture.test/list.m3u", route => route.fulfill({ body: '#EXTM3U\n#EXTINF:-1,Alpha\nhttps://fixture.test/bad.mp4' }));
    await page.route("https://fixture.test/bad.mp4", route => route.fulfill({ status: 404 }));
    await page.addInitScript(theme => {
      localStorage.setItem("iptv-hub.theme.v1", theme);
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "One", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    }, theme);
    await page.goto("/");
    await page.locator("#channel-list .channel-hit").click();
    await expect(page.locator(".channel-card")).toHaveClass(/has-failure/);
    await expect(page.locator("#btn-stream-out")).toBeHidden();
    await expect(page.locator("#now-title")).toBeVisible();
    await expect(page.locator("#now-title")).toHaveText("Alpha");
    await page.locator("#now-title").click();
    await expect(page.locator("#player-bar")).toHaveClass(/open/);
    await expect(page.locator("#btn-retry")).toBeVisible();
    await expect(page.locator("#btn-stream-out")).toBeVisible();
  });
}
