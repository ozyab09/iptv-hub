import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// #363: карточка передачи с описанием из EPG поверх гайда.
for (const width of [390, 1440]) {
  test(`programme card shows EPG description and closes before the guide (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const now = Date.now();
    const date = (ms: number) => new Date(ms).toISOString().replace(/\D/g, "").slice(0, 14) + " +0000";
    const mp4 = readFileSync("tests/fixtures/recording.mp4");
    const desc = "Line one &lt;b&gt;bold&lt;/b&gt;\nLine two";
    await page.route("https://fixture.test/**", (route) => {
      const url = route.request().url();
      if (url.endsWith(".xml")) {
        return route.fulfill({ body: `<tv><channel id="a"><display-name>Alpha</display-name></channel>`
          + `<programme channel="a" start="${date(now - 600_000)}" stop="${date(now + 600_000)}"><title>Live show</title><desc>${desc}</desc></programme>`
          + `<programme channel="a" start="${date(now + 600_000)}" stop="${date(now + 1_200_000)}"><title>Later show</title></programme></tv>` });
      }
      if (url.endsWith("playlist.m3u")) return route.fulfill({ body: "#EXTM3U\n#EXTINF:-1 tvg-id=\"a\",Alpha\nhttps://fixture.test/a.mp4\n" });
      return route.fulfill({ body: mp4, contentType: "video/mp4" });
    });
    await page.addInitScript(() => {
      localStorage.setItem("iptv-hub.language.v1", "en");
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "pc", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "pc");
    });
    await page.goto("/");
    await page.locator("#channel-list .channel-card").click();
    if (width < 1024) await page.locator("#video").click();
    await expect(page.locator("#now-show")).toHaveText("Live show");
    await page.locator("#btn-full-guide").click();
    await expect(page.locator("#guide-overlay")).toBeVisible();

    const live = page.locator("#guide-list .programme-recordable").filter({ hasText: "Live show" });
    await live.locator(".programme-info").click();
    const card = page.locator("#programme-overlay");
    await expect(card).toBeVisible();
    await expect(page.locator("#programme-card-title")).toHaveText("Live show");
    await expect(page.locator("#programme-card-meta")).toContainText("Alpha");
    await expect(page.locator("#programme-card-meta")).toContainText("On now");
    // Текст EPG — только textContent: разметка показывается как есть, перенос сохраняется.
    await expect(page.locator("#programme-card-desc")).toHaveText("Line one <b>bold</b>\nLine two");
    expect(await page.locator("#programme-card-desc b").count()).toBe(0);
    const box = await page.locator(".programme-card").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath("programme-card.png") });

    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await expect(page.locator("#guide-overlay")).toBeVisible();

    const later = page.locator("#guide-list .programme-recordable").filter({ hasText: "Later show" });
    await later.locator(".programme-info").click();
    await expect(page.locator("#programme-card-desc")).toBeHidden();
    await expect(page.locator("#programme-card-meta")).toContainText("Upcoming");
    await expect(page.locator("#programme-card-actions .schedule-programme")).toBeVisible();
    await page.goBack();
    await expect(card).toBeHidden();
    await expect(page.locator("#guide-overlay")).toBeVisible();

    await live.locator(".programme-info").click();
    await page.locator("#programme-card-actions .programme-watch").click();
    await expect(card).toBeHidden();
    await expect(page.locator("#now-title")).toHaveText("Alpha");
  });
}
