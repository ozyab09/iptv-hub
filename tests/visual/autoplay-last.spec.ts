import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function fixture(page: Page, enabled: boolean, blocked = false): Promise<void> {
  await page.addInitScript(({ enabled, blocked }) => {
    if (!localStorage.getItem("iptv-hub.playlists.v1")) {
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "auto", name: "TV", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "auto");
      localStorage.setItem("iptv-hub.recents.v1:auto", JSON.stringify(["https://fixture.test/b.mp4"]));
      localStorage.setItem("iptv-hub.player-settings.v1", JSON.stringify({ autoplayLastChannel: enabled }));
    }
    if (blocked) HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
  }, { enabled, blocked });
  const bytes = readFileSync("tests/fixtures/recording.mp4");
  await page.route("https://fixture.test/**", (route) => route.request().url().endsWith(".mp4")
    ? route.fulfill({ contentType: "video/mp4", body: bytes })
    : route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 group-title="Open",Alpha\nhttps://fixture.test/a.mp4\n#EXTINF:-1 group-title="Locked",Beta\nhttps://fixture.test/b.mp4\n' }));
}

test("opt-in resumes last channel and persists across reload; defaults leave player closed", async ({ page }) => {
  await fixture(page, false);
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
  await expect(page.locator("#player-bar")).toBeHidden();
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Настройки", visible: true }).first().click();
  await expect(page.locator("#player-autoplay-last")).not.toBeChecked();
  await page.locator("#player-autoplay-last").check();
  await page.locator('#player-settings-form button[type="submit"]').click();
  await page.reload();
  await expect(page.locator("#now-title")).toHaveText("Beta");
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  await page.reload();
  await expect(page.locator("#now-title")).toHaveText("Beta");
});

test("deep links override autoplay, including invalid or empty parameters", async ({ page }) => {
  await fixture(page, true);
  await page.goto("/?ch=" + encodeURIComponent("https://fixture.test/a.mp4"));
  await expect(page.locator("#now-title")).toHaveText("Alpha");
  for (const query of ["?p=" + encodeURIComponent("https://fixture.test/list.m3u"), "?ch=missing", "?ch=", "?p="]) {
    await page.goto("/" + query);
    await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
    await expect(page.locator("#player-bar")).toBeHidden();
  }
});

test("hidden groups, hidden channels and missing recent channels are skipped", async ({ page }) => {
  await fixture(page, true);
  await page.goto("/?p=");
  for (const [key, value] of [
    ["iptv-hub.groups.v1:auto", { hidden: ["Locked"], order: [] }],
    ["iptv-hub.channel-overrides.v1:auto", [{ url: "https://fixture.test/b.mp4", hidden: true }]],
    ["iptv-hub.recents.v1:auto", ["https://fixture.test/missing.mp4"]],
  ] as const) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value });
    await page.goto("/");
    await expect(page.locator("#channel-list .channel-card").first()).toBeVisible();
    await expect(page.locator("#player-bar")).toBeHidden();
    await page.evaluate((key) => localStorage.removeItem(key), key);
  }
});

test("autoplay asks for PIN before playback and cancellation leaves player closed", async ({ page }) => {
  await fixture(page, true);
  await page.goto("/?p=");
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Настройки", visible: true }).first().click();
  await page.locator("#pin-group").selectOption("Locked");
  await page.locator("#pin-set").click();
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog [name="confirmation"]').fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#pin-dialog")).toBeHidden();
  await page.goto("/");
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await expect(page.locator("#video")).not.toHaveAttribute("src", /b\.mp4/);
  await page.locator("[data-pin-cancel]").click();
  await expect(page.locator("#player-bar")).toBeHidden();
  await page.reload();
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#now-title")).toHaveText("Beta");
});

test("blocked browser autoplay leaves a paused player with Play available", async ({ page }) => {
  await fixture(page, true, true);
  await page.goto("/");
  await expect(page.locator("#now-title")).toHaveText("Beta");
  await expect(page.locator("#video")).toHaveJSProperty("paused", true);
  await expect(page.locator("#btn-pause")).toBeVisible();
  await expect(page.locator("#btn-pause")).toBeEnabled();
});
