import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const M3U = "#EXTM3U\n#EXTINF:-1,Shared One\nhttps://fixture.test/1.mp4\n";

async function routes(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://fixture.test/**", (route) => route.request().url().endsWith(".m3u")
    ? route.fulfill({ body: M3U }) : route.fulfill({ status: 404 }));
  await page.addInitScript(() => localStorage.setItem("iptv-hub.language.v1", "en"));
}

const playlists = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.playlists.v1") ?? "[]") as { name: string; playlistUrl: string }[]);

// #373: «Поделиться → IPTV Hub» превращает ссылку в ?p= и добавляет плейлист.
test("shared link from share_target is upserted as a playlist", async ({ page }) => {
  await routes(page);
  await page.goto("/?title=TV&text=" + encodeURIComponent("Look: https://fixture.test/shared.m3u"));
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  expect(await page.evaluate(() => location.search)).toBe("?p=" + encodeURIComponent("https://fixture.test/shared.m3u"));
  expect((await playlists(page)).map((p) => p.playlistUrl)).toEqual(["https://fixture.test/shared.m3u"]);
});

test("dropping an .m3u file imports it as a local playlist after naming", async ({ page }) => {
  await routes(page);
  await page.goto("/");
  page.once("dialog", (dialog) => {
    expect(dialog.type()).toBe("prompt");
    expect(dialog.defaultValue()).toContain("dropped");
    void dialog.accept("From drop");
  });
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], "dropped.m3u", { type: "audio/x-mpegurl" }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, M3U);
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  expect((await playlists(page)).map((p) => p.name)).toEqual(["From drop"]);
});

test("Android bridge import goes through the same local import", async ({ page }) => {
  await routes(page);
  await page.goto("/");
  await page.evaluate((text) => (window as unknown as { iptvHubImportPlaylist: (n: string, c: string) => void }).iptvHubImportPlaylist("tv.m3u", text), M3U);
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  expect(await playlists(page)).toHaveLength(1);
  await page.evaluate(() => (window as unknown as { iptvHubImportPlaylist: (n: string, c: string) => void }).iptvHubImportPlaylist("bad.m3u", "not a playlist"));
  await expect(page.locator("#setup-error")).toContainText("M3U");
  expect(await playlists(page)).toHaveLength(1);
});
