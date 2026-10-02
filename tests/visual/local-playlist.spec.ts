import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const m3u = "#EXTM3U\n#EXTINF:-1,Local One\nhttps://fixture.test/one.mp4\n#EXTINF:-1,Local Two\nhttps://fixture.test/two.mp4\n";

for (const extension of ["m3u", "m3u8"]) {
  test(`import ${extension}, offline reload and deletion`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("iptv-hub.language.v1", "en"));
    await page.goto("/");
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#btn-local-file").click();
    await (await chooserPromise).setFiles({ name: `Local.${extension}`, mimeType: "application/x-mpegurl", buffer: Buffer.from(m3u) });
    await expect(page.locator("#pl-switch-name")).toHaveText("Local");
    await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
    await page.route("https://**", (route) => route.abort());
    await page.reload();
    await expect(page.locator("#channel-list .channel-card").first()).toContainText("Local One");
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.playlists.v1")!)[0].id as string);
    await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete “Local”", exact: true }).click();
    await expect.poll(() => page.evaluate(async (id) => {
      const dir = await navigator.storage.getDirectory();
      try { await dir.getFileHandle(`local:${id}`); return true; } catch { return false; }
    }, id)).toBe(false);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.playlists.v1")!))).toEqual([]);
  });
}

test("recovers legacy local URLs and keeps favorites", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (content) => {
    const dir = await navigator.storage.getDirectory();
    const file = await dir.getFileHandle("local:123-old", { create: true });
    const writer = await file.createWritable();
    await writer.write(content);
    await writer.close();
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "123-old", name: "Legacy", playlistUrl: "local:123", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "123-old");
    localStorage.setItem("iptv-hub.favorites.v1:123-old", JSON.stringify(["https://fixture.test/one.mp4"]));
  }, m3u);
  await page.route("https://**", (route) => route.abort());
  await page.reload();
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
  await expect(page.locator("#pl-switch-name")).toHaveText("Legacy");
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Favorites", visible: true }).first().click();
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await expect(page.locator("#channel-list .channel-card")).toContainText("Local One");
});
