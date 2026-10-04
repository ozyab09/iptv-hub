import { expect, test, type Page } from "@playwright/test";
import { t } from "../../src/i18n";

test.use({ serviceWorkers: "block" });
const playlist = "#EXTM3U\n#EXTINF:-1 tvg-id=\"tv\",News\nhttps://fixture.test/live.mp4\n";
const epg = "<tv><channel id=\"tv\"><display-name>News</display-name></channel><programme channel=\"tv\" start=\"20261003000000 +0000\" stop=\"20261005000000 +0000\"><title>News hour</title></programme></tv>";

async function seed(page: Page, epgUrl: string | null): Promise<void> {
  await page.clock.install();
  await page.addInitScript((epgUrl) => {
    localStorage.setItem("iptv-hub.language.v1", "ru");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "timeout", name: "Timeout", playlistUrl: "https://fixture.test/list.m3u", epgUrl }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "timeout");
  }, epgUrl);
}

async function settings(page: Page): Promise<void> {
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Настройки", visible: true }).first().click();
}

test("stalled initial EPG leaves loading state after 45 seconds", async ({ page }) => {
  await seed(page, "https://fixture.test/epg.xml");
  let requested = false;
  await page.route("https://fixture.test/**", (route) => {
    if (route.request().url().endsWith("epg.xml")) { requested = true; return; }
    return route.fulfill({ body: playlist });
  });
  await page.goto("/");
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator("#epg-now")).toHaveText(t("loading.epg", "ru"));
  await page.clock.fastForward(45_001);
  await expect(page.locator("#epg-now")).toHaveText(t("error.epg", "ru"));
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
});

test("EPG timeout releases refresh and reports no programmes; next refresh succeeds", async ({ page }) => {
  await seed(page, "https://fixture.test/epg.xml");
  let stall = false;
  let requests = 0;
  await page.route("https://fixture.test/**", (route) => {
    if (route.request().url().endsWith("epg.xml")) {
      requests++;
      if (stall) return;
      return route.fulfill({ body: epg });
    }
    return route.fulfill({ body: playlist });
  });
  await page.goto("/");
  await expect.poll(() => requests).toBe(1);
  await expect(page.locator("#epg-now")).toBeHidden();
  stall = true;
  await settings(page);
  await page.locator("#btn-refresh-now").click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator("#btn-refresh-now")).toHaveAttribute("aria-busy", "true");
  await page.clock.fastForward(45_001);
  await expect(page.locator("#btn-refresh-now")).not.toHaveAttribute("aria-busy", "true");
  await page.locator("#notif-bell").click();
  await expect(page.locator("#notif-list")).toContainText("передач нет");
  await page.locator("#notif-bell").click();
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Каналы", visible: true }).first().click();
  await expect(page.locator("#epg-now")).toHaveText(t("error.epg", "ru"));
  await settings(page);
  stall = false;
  await page.locator("#btn-refresh-now").click();
  await expect.poll(() => requests).toBe(3);
  await expect(page.locator("#btn-refresh-now")).not.toHaveAttribute("aria-busy", "true");
  await page.locator("#notif-bell").click();
  await expect(page.locator("#notif-list")).toContainText("передач: 2");
});

test("playlist timeout releases refresh; a later check can load changed channels", async ({ page }) => {
  await seed(page, null);
  let stall = false;
  let requests = 0;
  await page.route("https://fixture.test/**", (route) => {
    requests++;
    if (stall) return;
    return route.fulfill({ body: requests > 2 ? playlist + "#EXTINF:-1,Sports\nhttps://fixture.test/sports.mp4\n" : playlist });
  });
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await settings(page);
  stall = true;
  await page.locator("#btn-refresh-now").click();
  await expect.poll(() => requests).toBe(2);
  await page.clock.fastForward(45_001);
  await expect(page.locator("#btn-refresh-now")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#toast")).toHaveText(t("error.refresh", "ru"));
  stall = false;
  await page.locator("#btn-refresh-now").click();
  await expect.poll(() => requests).toBe(3);
  await expect(page.locator("#btn-refresh-now")).not.toHaveAttribute("aria-busy", "true");
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Каналы", visible: true }).first().click();
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
});
