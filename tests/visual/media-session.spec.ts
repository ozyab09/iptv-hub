import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const session = (page: Page) => page.evaluate(() => ({
  title: navigator.mediaSession.metadata?.title ?? null,
  artist: navigator.mediaSession.metadata?.artist ?? null,
  state: navigator.mediaSession.playbackState,
}));
const action = (page: Page, name: string) => page.evaluate((n) => (window as unknown as { msHandlers: Record<string, () => void> }).msHandlers[n]?.(), name);

// #362: карточка канала/передачи в системном плеере и кнопки гарнитуры.
test("media session shows channel and programme and drives playback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const now = Date.now();
  const date = (ms: number) => new Date(ms).toISOString().replace(/\D/g, "").slice(0, 14) + " +0000";
  const mp4 = readFileSync("tests/fixtures/recording.mp4");
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith(".xml")) return route.fulfill({ body: `<tv><channel id="a"><display-name>Alpha</display-name></channel><programme channel="a" start="${date(now - 600_000)}" stop="${date(now + 600_000)}"><title>Morning news</title></programme></tv>` });
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: ["Alpha", "Beta", "Gamma"].map((n, i) => `#EXTINF:-1 tvg-id="${n === "Alpha" ? "a" : n}" tvg-logo="https://fixture.test/${i}.png",${n}\nhttps://fixture.test/${i}.mp4`).join("\n").replace(/^/, "#EXTM3U\n") });
    if (url.endsWith(".png")) return route.fulfill({ status: 404 });
    return route.fulfill({ body: mp4, contentType: "video/mp4" });
  });
  await page.addInitScript(() => {
    const handlers: Record<string, () => void> = {};
    (window as unknown as { msHandlers: Record<string, () => void> }).msHandlers = handlers;
    const original = MediaSession.prototype.setActionHandler;
    MediaSession.prototype.setActionHandler = function (name, handler) {
      if (handler) handlers[name] = handler as () => void;
      return original.call(this, name, handler);
    };
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "ms", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "ms");
  });
  await page.goto("/");
  await page.locator("#channel-list .channel-card").filter({ hasText: "Alpha" }).click();
  await expect.poll(() => session(page)).toEqual({ title: "Alpha", artist: "Morning news", state: "playing" });

  await action(page, "pause");
  await expect.poll(() => page.locator("#video").evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect.poll(async () => (await session(page)).state).toBe("paused");
  await action(page, "play");
  await expect.poll(() => page.locator("#video").evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

  await action(page, "nexttrack");
  await expect(page.locator("#now-title")).toHaveText("Beta");
  await expect.poll(async () => (await session(page)).title).toBe("Beta");

  // Одно нажатие, пришедшее и keydown, и через MediaSession, листает один канал.
  await page.waitForTimeout(200);
  await page.locator("#video").dispatchEvent("keydown", { key: "MediaTrackNext", code: "MediaTrackNext", bubbles: true });
  await action(page, "nexttrack");
  await expect(page.locator("#now-title")).toHaveText("Gamma");
  await page.waitForTimeout(400);
  await expect(page.locator("#now-title")).toHaveText("Gamma");

  await page.locator("#btn-close-player").click();
  await expect.poll(() => session(page)).toEqual({ title: null, artist: null, state: "none" });
});
