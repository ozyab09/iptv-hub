import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// #357: набор слова в поиске перерисовывает список после паузы, а не на
// каждую букву; результат совпадает с полным запросом.
test("typing a word re-renders the channel list once after the pause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const playlist = "#EXTM3U\n" + Array.from({ length: 300 }, (_, i) =>
    `#EXTINF:-1 tvg-id="c${i}",Channel ${String(i).padStart(3, "0")}\nhttps://fixture.test/${i}.mp4\n`).join("");
  const day = Date.UTC(2026, 9, 4);
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const programmes = Array.from({ length: 300 }, (_, c) => Array.from({ length: 24 }, (_, h) =>
    `<programme start="${stamp(day + h * 3600_000)}" stop="${stamp(day + (h + 1) * 3600_000)}" channel="c${c}"><title>${h === 20 && c % 30 === 0 ? "Football final" : `News ${h}`}</title></programme>`).join("")).join("");
  const epg = `<tv>${Array.from({ length: 300 }, (_, c) => `<channel id="c${c}"><display-name>Channel ${c}</display-name></channel>`).join("")}${programmes}</tv>`;
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: playlist });
    if (url.endsWith("epg.xml")) return route.fulfill({ body: epg });
    return route.fulfill({ status: 404 });
  });
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "deb", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "deb");
  });
  const epgLoaded = page.waitForResponse((r) => r.url().endsWith("epg.xml"));
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card").first()).toBeVisible();
  await epgLoaded;
  await page.waitForTimeout(500);

  await page.locator("#search").focus();
  await page.evaluate(() => {
    const w = window as unknown as { renders: number };
    w.renders = 0;
    new MutationObserver(() => { w.renders++; }).observe(document.querySelector("#channel-list")!, { childList: true, subtree: true });
  });
  await page.keyboard.type("Footbal", { delay: 40 });
  await expect(page.locator("#search")).toHaveValue("Footbal");
  await expect(page.locator("#channel-list .programme-result")).toHaveCount(10);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { renders: number }).renders)).toBeLessThanOrEqual(2);
});
