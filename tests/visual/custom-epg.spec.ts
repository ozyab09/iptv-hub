import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const date = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
const xml = (entries: [string, string][]): string => `<tv>${entries.map(([id, title]) => `<programme channel="${id}" start="${date(Date.now() - 60000)}" stop="${date(Date.now() + 3600000)}"><title>${title}</title></programme>`).join("")}</tv>`;

for (const width of [390, 1440]) {
  test(`source priority, manual ID, editor and backup (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: string[] = [];
    await page.route("https://fixture.test/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      if (path === "/primary.xml") return route.fulfill({ body: xml([["one", "Primary programme"]]) });
      if (path === "/extra.xml") return route.fulfill({ body: xml([["one", "Secondary conflict"], ["two", "Extra programme"]]) });
      if (path === "/header.xml") return route.fulfill({ body: xml([["one", "Header conflict"], ["three", "Header programme"]]) });
      if (path === "/broken.xml") return route.fulfill({ status: 503 });
      if (path.endsWith(".mp4")) return route.fulfill({ body: readFileSync("tests/fixtures/recording.mp4"), contentType: "video/mp4" });
      return route.fulfill({ body: '#EXTM3U tvg-url="https://fixture.test/header.xml"\n#EXTINF:-1 tvg-id="one",Alpha\nhttps://fixture.test/a.mp4\n#EXTINF:-1 tvg-id="wrong",Beta\nhttps://fixture.test/b.mp4\n#EXTINF:-1 tvg-id="three",Gamma\nhttps://fixture.test/c.mp4' });
    });
    await page.goto("/");
    await page.locator("#setup-playlist").fill("https://fixture.test/list.m3u");
    await page.locator("#add-form details").evaluate((node) => (node as HTMLDetailsElement).open = true);
    await page.locator("#setup-epg").fill("https://fixture.test/primary.xml");
    await page.locator("#setup-additional-epg").fill("https://fixture.test/extra.xml https://fixture.test/broken.xml");
    await page.locator("#setup-load").click();
    const rows = page.locator("#channel-list .channel-card");
    const row = (name: string) => rows.filter({ hasText: name });
    await expect(row("Alpha")).toContainText("Primary programme");
    await expect(row("Gamma")).toContainText("Header programme");
    await expect(row("Beta")).not.toContainText("Extra programme");
    expect(requests).toEqual(expect.arrayContaining(["/primary.xml", "/extra.xml", "/header.xml", "/broken.xml"]));
    await row("Beta").locator("[data-channel-edit]").click();
    await page.locator("#channel-epg-id").fill("two");
    await page.locator('#channel-editor button[type="submit"]').click();
    await expect(row("Beta")).toContainText("Extra programme");
    await page.locator("#search").fill("Extra programme");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Beta");
    await page.locator("#search").fill("");
    await row("Beta").click();
    await expect(page.locator("#now-title")).toContainText("Beta");
    await expect(page.locator("#now-show")).toContainText("Extra programme");
    if (width < 1024) await page.locator("#player-bar").click();
    await expect(page.locator("#sched-list .prog-row")).toContainText("Extra programme");
    await page.locator("#btn-close-player").click();
    const nav = (name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first();
    await nav("Настройки").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#btn-export").click();
    const file = (await (await downloadPromise).path())!;
    const backup = JSON.parse(readFileSync(file, "utf8"));
    const playlist = backup.playlists[0];
    expect(playlist.additionalEpgUrls).toEqual(["https://fixture.test/extra.xml", "https://fixture.test/broken.xml"]);
    expect(backup.channelOverrides[playlist.id][0].epgId).toBe("two");
    await page.locator("#channel-overrides-reset").click();
    await page.locator("#import-file").setInputFiles(file);
    await expect(row("Beta")).toContainText("Extra programme");
    await nav("Настройки").click();
    await page.locator(".pl-act:not(.pl-del)").first().click();
    const inputs = page.locator(".pl-edit .field input");
    await expect(inputs.nth(3)).toHaveValue("https://fixture.test/extra.xml https://fixture.test/broken.xml");
    await inputs.nth(3).fill("javascript:alert(1)");
    await page.locator('.pl-edit button[type="submit"]').click();
    await expect(page.locator("#setup-error")).toContainText("HTTP(S)");
    await inputs.nth(3).fill("https://fixture.test/extra.xml");
    await page.locator('.pl-edit button[type="submit"]').click();
    await expect(row("Beta")).toContainText("Extra programme");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("slow sources leave channels usable and cannot replace the next playlist", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([
      { id: "one", name: "First", playlistUrl: "https://fixture.test/one.m3u", epgUrl: null, additionalEpgUrls: ["https://fixture.test/slow.xml", "https://fixture.test/large.xml"] },
      { id: "two", name: "Second", playlistUrl: "https://fixture.test/two.m3u", epgUrl: "https://fixture.test/new.xml" },
    ]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
  });
  let release!: () => void;
  let slow = false;
  await page.route("https://fixture.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/slow.xml") { slow = true; await new Promise<void>((resolve) => release = resolve); return route.fulfill({ body: xml([["one", "Late old programme"]]) }); }
    if (path === "/large.xml") return route.fulfill({ body: xml(Array.from({ length: 2500 }, (_, i) => [`extra${i}`, `Programme ${i}`])) });
    if (path === "/new.xml") return route.fulfill({ body: xml([["one", "New programme"]]) });
    return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="one",Channel\nhttps://fixture.test/a.mp4' });
  });
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toContainText("Channel");
  await expect.poll(() => slow).toBe(true);
  await expect(page.locator("#epg-now")).toContainText("1/2");
  await page.locator("#pl-switch-btn").click();
  await page.locator("#pl-switch-menu button").filter({ hasText: "Second" }).click();
  await expect(page.locator("#channel-list .channel-card")).toContainText("New programme");
  const lateResponse = page.waitForResponse("https://fixture.test/slow.xml");
  release();
  await (await lateResponse).finished();
  await expect(page.locator("#channel-list .channel-card")).toContainText("New programme");
  await expect(page.locator("#channel-list")).not.toContainText("Late old programme");
});
