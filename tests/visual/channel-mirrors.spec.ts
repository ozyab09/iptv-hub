import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function openFixture(page: Page, m3u: string, epg = false): Promise<string[]> {
  const requests: string[] = [];
  const mp4 = readFileSync("tests/fixtures/recording.mp4");
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  const date = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const now = Date.now();
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: m3u });
    if (url.endsWith("epg.xml")) return route.fulfill({ body: `<tv><channel id="a"><display-name>Alpha</display-name></channel><programme channel="a" start="${date(now - 3600000)}" stop="${date(now - 60000)}"><title>Archive show</title></programme></tv>` });
    if (url.includes("bad") || url.includes("archive")) return route.fulfill({ status: 404 });
    if (url.endsWith(".ts")) return route.fulfill({ body: ts, contentType: "video/mp2t" });
    if (url.endsWith(".m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4,\none.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\ntwo.ts\n#EXT-X-ENDLIST\n" });
    return route.fulfill({ contentType: "video/mp4", body: mp4 });
  });
  await page.addInitScript((epg) => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "One", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: epg ? "https://fixture.test/epg.xml" : null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  }, epg);
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  return requests;
}

for (const ext of ["mp4", "m3u8"]) {
  test(`a failed ${ext} source falls back silently with real video frames`, async ({ page }) => {
    const first = `https://fixture.test/bad.${ext}`;
    const second = `https://fixture.test/good.${ext}`;
    const requests = await openFixture(page, `#EXTINF:-1 tvg-id="a",Alpha\n${first}\n#EXTINF:-1 tvg-id="a",Other label\n${second}\n`);
    await page.locator("#channel-list .channel-card").click();
    await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth), { timeout: 20000 }).toBe(160);
    expect(requests).toContain(first);
    expect(requests).toContain(second);
    await expect(page.locator("#now-title")).toHaveText("Alpha");
    await expect(page.locator("#toast")).toBeHidden();
    await expect(page.locator("#btn-retry")).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recents.v1:one")!))).toEqual([first]);
  });
}

test("pipe mirrors and mirror deep links preserve the primary channel identity", async ({ page }) => {
  const requests = await openFixture(page, '#EXTINF:-1,Alpha\nhttps://fixture.test/bad.mp4 | https://fixture.test/good.mp4\n');
  await page.goto("/?ch=" + encodeURIComponent("https://fixture.test/good.mp4"));
  await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
  expect(requests).toContain("https://fixture.test/bad.mp4");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recents.v1:one")!))).toEqual(["https://fixture.test/bad.mp4"]);
});

test("exhausted mirrors show retry and manual retry starts with the primary URL", async ({ page }) => {
  const requests = await openFixture(page, '#EXTINF:-1,Alpha\nhttps://fixture.test/bad-one.mp4 | https://fixture.test/bad-two.mp4\n');
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#btn-retry")).toBeVisible();
  expect(requests).toContain("https://fixture.test/bad-two.mp4");
  const before = requests.filter((url) => url.endsWith("bad-one.mp4")).length;
  await page.locator("#btn-retry").click();
  await expect.poll(() => requests.filter((url) => url.endsWith("bad-one.mp4")).length).toBeGreaterThan(before);
});

test("a failed catchup request never switches to a live mirror", async ({ page }) => {
  const requests = await openFixture(page, '#EXTINF:-1 tvg-id="a" catchup-days="2" catchup-source="https://fixture.test/archive.mp4?utc={utc}",Alpha\nhttps://fixture.test/good-one.mp4 | https://fixture.test/good-two.mp4\n', true);
  await page.locator("#search").fill("Archive show");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#btn-retry")).toBeVisible();
  expect(requests.some((url) => url.includes("good-one") || url.includes("good-two"))).toBe(false);
  expect(requests.some((url) => url.includes("archive.mp4"))).toBe(true);
});

test("a mirror deep link cannot bypass the channel group PIN", async ({ page }) => {
  const requests = await openFixture(page, '#EXTINF:-1 group-title="Locked",Alpha\nhttps://fixture.test/bad.mp4 | https://fixture.test/good.mp4\n');
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
  await page.locator("#pin-set").click();
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog [name="confirmation"]').fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#pin-dialog")).not.toBeVisible();
  await page.goto("/?ch=" + encodeURIComponent("https://fixture.test/good.mp4"));
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await page.locator("#parental-pin").fill("9999");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator('#pin-dialog [role="alert"]')).toHaveText("Incorrect PIN");
  expect(requests.some((url) => url.endsWith(".mp4"))).toBe(false);
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
});
