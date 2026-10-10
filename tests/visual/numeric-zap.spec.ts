import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function setup(page: Page, width = 1440, theme = "dark", hls = false): Promise<() => void> {
  await page.setViewportSize({ width, height: 900 });
  const mp4 = readFileSync("tests/fixtures/recording.mp4");
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  let release = () => {};
  const segment = new Promise<void>((resolve) => { release = resolve; });
  const playlist = "#EXTM3U\n" + Array.from({ length: 30 }, (_, i) =>
    `#EXTINF:-1 group-title="${i < 25 ? "Main" : "Other"}",Channel ${String(i + 1).padStart(3, "0")}\nhttps://fixture.test/${i + 1}.${hls ? "m3u8" : "mp4"}\n`).join("");
  await page.route("https://fixture.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: playlist });
    if (url.endsWith(".m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nfirst.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\nsecond.ts\n#EXT-X-ENDLIST\n" });
    if (url.endsWith("second.ts")) await segment;
    return route.fulfill({ body: url.endsWith(".ts") ? ts : mp4, contentType: url.endsWith(".ts") ? "video/mp2t" : "video/mp4" });
  });
  await page.addInitScript((theme) => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.theme.v1", theme);
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "zap", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "zap");
  }, theme);
  await page.goto("/");
  await page.locator("#channel-list .channel-card").first().click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  if (width < 1024) await page.locator("#player-bar").click();
  await page.locator("#video").focus();
  return release;
}

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`25 switches only after idle; overlay and invalid number (${width}, ${theme})`, async ({ page }) => {
      await setup(page, width, theme);
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      await page.keyboard.press("2");
      await expect(page.locator("#numeric-zap")).toHaveText("2");
      await page.clock.runFor(900);
      await page.keyboard.press("5");
      await expect(page.locator("#numeric-zap")).toHaveText("25");
      const box = await page.locator("#numeric-zap").boundingBox();
      const frame = await page.locator("#video-stage").boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(frame!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(frame!.y + frame!.height);
      await page.clock.runFor(999);
      await expect(page.locator("#now-title")).toHaveText("Channel 001");
      await page.clock.runFor(1);
      await expect(page.locator("#now-title")).toHaveText("Channel 025");
      await expect(page.locator("#numeric-zap")).toBeHidden();
      await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
      await page.keyboard.press("0");
      await page.clock.runFor(1000);
      await expect(page.locator("#toast")).toHaveText("No channel with this number in the current list");
      await expect(page.locator("#now-title")).toHaveText("Channel 025");
    });
  }
}

test("Escape, search, settings, dialogs and closing cancel or ignore numeric input", async ({ page }) => {
  await setup(page);
  await page.keyboard.press("2");
  await page.keyboard.press("Escape");
  await expect(page.locator("#numeric-zap")).toBeHidden();
  await page.keyboard.press("Control+2");
  await expect(page.locator("#numeric-zap")).toBeHidden();
  await page.locator("#search").focus();
  await page.keyboard.type("25");
  await expect(page.locator("#search")).toHaveValue("25");
  await expect(page.locator("#numeric-zap")).toBeHidden();
  await page.locator("#search").fill("");
  // Кнопка сна видна только во время записи (#471), а mp4-фикстура писать
  // не умеет — диалог для проверки берём у редактора канала.
  await page.locator("#channel-list [data-channel-edit]").first().click();
  await expect(page.locator("#channel-editor")).toHaveJSProperty("open", true);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("2");
  await expect(page.locator("#numeric-zap")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#channel-editor")).not.toHaveJSProperty("open", true);
  await page.locator("#side-nav button").filter({ hasText: "Settings" }).click();
  await page.locator("#video").focus();
  await page.keyboard.press("2");
  await expect(page.locator("#numeric-zap")).toBeHidden();
  await page.locator("#side-nav button").filter({ hasText: "Channels" }).click();
  await page.locator("#video").focus();
  await page.keyboard.press("2");
  await page.locator("#btn-close-player").click();
  await expect(page.locator("#numeric-zap")).toBeHidden();
  await page.waitForTimeout(1200);
  await expect(page.locator("#player-bar")).toBeHidden();
});

test("numbers use the filtered list and cannot bypass a category PIN", async ({ page }) => {
  await setup(page);
  await page.locator("#btn-categories").click();
  await page.locator("#cat-menu .menu-item").filter({ hasText: "Other" }).click();
  await page.locator("#video").focus();
  await page.locator("#video").dispatchEvent("keydown", { key: "2", code: "Numpad2", bubbles: true });
  await expect(page.locator("#now-title")).toHaveText("Channel 027");
  await page.locator("#side-nav button").filter({ hasText: "Settings" }).click();
  await page.locator("#pin-group").selectOption("Main");
  await page.locator("#pin-set").click();
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog [name="confirmation"]').fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#pin-dialog")).not.toBeVisible();
  await page.locator("#side-nav button").filter({ hasText: "Channels" }).click();
  await page.locator("#video").focus();
  await page.keyboard.press("2");
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await expect(page.locator("#now-title")).toHaveText("Channel 027");
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#now-title")).toHaveText("Channel 002");
});

test("ZAP saves the partial HLS recording and the saved file plays", async ({ page }) => {
  const release = await setup(page, 1440, "dark", true);
  await page.locator("#btn-rec").click();
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  release();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 15000 }).toBeGreaterThan(4);
  await page.locator("#video").focus();
  await page.keyboard.press("1");
  await page.waitForTimeout(1100);
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  await page.keyboard.press("2");
  await expect(page.locator("#now-title")).toHaveText("Channel 002");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1") ?? "[]").length)).toBe(1);
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1")!)[0] as { channelName: string; sizeBytes: number });
  expect(meta.channelName).toBe("Channel 001");
  expect(meta.sizeBytes).toBeGreaterThan(0);
  await page.locator("#side-nav button").filter({ hasText: "Recordings" }).click();
  await page.locator(".recording-play").click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
});
