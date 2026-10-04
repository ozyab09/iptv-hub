import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// #350: нечинящаяся media-ошибка не крутит recover вечно — после предела
// показывается кнопка повтора, тост о декодировании не повторяется бесконечно.
test("unrecoverable media error ends with the retry button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const garbage = Buffer.alloc(188 * 200, 0x47);
  for (let i = 0; i < garbage.length; i += 188) garbage.fill(0xff, i + 1, i + 188);
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Broken\nhttps://fixture.test/b.m3u8\n" });
    if (url.endsWith(".m3u8")) {
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n" + Array.from({ length: 10 }, (_, i) => `#EXTINF:4,\ns${i}.ts\n`).join("") + "#EXT-X-ENDLIST\n" });
    }
    return route.fulfill({ body: garbage, contentType: "video/mp2t" });
  });
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "media", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "media");
  });
  const toasts: string[] = [];
  await page.exposeFunction("noteToast", (text: string) => toasts.push(text));
  await page.goto("/");
  await page.evaluate(() => {
    const toast = document.querySelector("#toast")!;
    new MutationObserver(() => (window as unknown as { noteToast: (t: string) => void }).noteToast(toast.textContent ?? ""))
      .observe(toast, { childList: true, characterData: true, subtree: true });
  });
  await page.locator("#channel-list .channel-card").first().click();
  await expect(page.locator("#btn-retry")).toBeVisible({ timeout: 20_000 });
  const decoding = toasts.filter((t) => t.includes("Decoding error")).length;
  await page.waitForTimeout(3000);
  expect(toasts.filter((t) => t.includes("Decoding error")).length).toBe(decoding);
  expect(decoding).toBeLessThanOrEqual(2);
});
