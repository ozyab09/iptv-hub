import { expect, test, type Page } from "@playwright/test";

async function openSearch(page: Page, withEpg = true, title?: string): Promise<void> {
  const now = Date.now();
  const xmlDate = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const xml = `<tv><channel id="sport"><display-name>Спорт</display-name></channel>
    <programme channel="sport" start="${xmlDate(now - 7200000)}" stop="${xmlDate(now - 3600000)}"><title>${title ?? "Футбол: финал"}</title></programme>
    <programme channel="sport" start="${xmlDate(now - 600000)}" stop="${xmlDate(now + 3600000)}"><title>${title ?? "Футбол: эфир"}</title></programme></tv>`;
  const m3u = '#EXTM3U\n#EXTINF:-1 tvg-id="sport" catchup-days="2" catchup-source="https://fixture.test/archive/{utc}.mp4",Спорт\nhttps://fixture.test/live.mp4\n';
  await page.route("https://fixture.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) await route.fulfill({ body: m3u });
    else if (url.endsWith("epg.xml")) await route.fulfill({ body: xml });
    else await route.fulfill({ status: 404 });
  });
  await page.addInitScript((enabled) => {
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{
      id: "search", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u",
      epgUrl: enabled ? "https://fixture.test/epg.xml" : null,
    }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "search");
  }, withEpg);
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card").first()).toBeVisible();
  if (withEpg) await expect(page.locator("#epg-now")).toBeHidden();
}

for (const width of [390, 1440]) {
  test(`поиск без пунктуации (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openSearch(page, true, "Что? Где? Когда?");
    const search = page.locator("#search");
    const rows = page.locator("#channel-list .channel-card");
    for (const query of ["что где когда", "Что? Где? Когда?", " ГДЕ   КОГДА ", "что—где—когда"]) {
      await search.fill(query);
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText("Спорт · Что? Где? Когда?");
    }
    await search.fill("???");
    await expect(rows).toHaveCount(0);
    await expect(page.locator("#empty-state")).toBeVisible();
    await search.fill("что где когда");
    const request = page.waitForRequest((r) => r.url().includes("/archive/"));
    await rows.first().click();
    await request;
    await expect(page.locator("#now-title")).toHaveText("Спорт · архив");
  });
  test(`поиск передач, архив и эфир (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openSearch(page);
    await page.locator("#search").fill("ФУТБОЛ");
    const rows = page.locator("#channel-list .channel-card");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Спорт · Футбол: финал");
    await expect(page.locator("#empty-state")).toBeHidden();
    await page.locator("#search").press("ArrowDown");
    await expect(rows.first()).toBeFocused();
    const archiveRequest = page.waitForRequest((request) => request.url().includes("/archive/"));
    await page.keyboard.press("Enter");
    await archiveRequest;
    await expect(page.locator("#now-title")).toHaveText("Спорт · архив");
    await page.locator("#btn-close-player").click();
    const liveRequest = page.waitForRequest("https://fixture.test/live.mp4");
    await rows.filter({ hasText: "Футбол: эфир" }).click();
    await liveRequest;
    await expect(page.locator("#now-title")).toHaveText("Спорт");
  });
}

test("без EPG сохраняется поиск каналов", async ({ page }) => {
  await openSearch(page, false);
  await page.locator("#search").fill("Футбол");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(0);
  await page.locator("#search").fill("Спорт");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
});
