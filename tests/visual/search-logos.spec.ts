import { expect, test, type Page } from "@playwright/test";

// Моки картинок должны обрабатываться Playwright, а не service worker.
test.use({ serviceWorkers: "block" });

async function checkLogos(page: Page): Promise<void> {
  const rows = page.locator("#channel-list .channel-card");
  await expect(rows).toHaveCount(3);
  const good = rows.nth(0).locator(".logo img");
  await expect(good).toHaveAttribute("src", "https://fixture.test/logo.svg");
  await expect.poll(() => good.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(36);
  await expect(rows.nth(1).locator(".logo")).toHaveText("BE");
  await expect(rows.nth(1).locator(".logo img")).toHaveCount(0);
  await expect(rows.nth(2).locator(".logo")).toHaveText("GA");
  await expect(rows.nth(2).locator(".logo img")).toHaveCount(0);
  for (const name of ["Alpha", "Beta", "Gamma"]) {
    await expect(page.locator(`#channel-list .logo[title="${name}"]`)).toBeVisible();
  }
}

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`логотипы каналов и передач (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const date = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
      const now = Date.now();
      const xml = "<tv>" + ["a", "b", "g"].map((id) =>
        `<programme channel="${id}" start="${date(now - 600000)}" stop="${date(now + 3600000)}"><title>Logo match: длинное название передачи для проверки строки</title></programme>`).join("") + "</tv>";
      const m3u = '#EXTM3U\n' +
        '#EXTINF:-1 tvg-id="a" tvg-logo="https://fixture.test/logo.svg",Alpha\nhttps://fixture.test/a.mp4\n' +
        '#EXTINF:-1 tvg-id="b" tvg-logo="https://fixture.test/missing.svg",Beta\nhttps://fixture.test/b.mp4\n' +
        '#EXTINF:-1 tvg-id="g",Gamma\nhttps://fixture.test/g.mp4\n';
      await page.route("https://fixture.test/**", async (route) => {
        const url = route.request().url();
        if (url.endsWith("playlist.m3u")) await route.fulfill({ body: m3u });
        else if (url.endsWith("epg.xml")) await route.fulfill({ body: xml });
        else if (url.endsWith("logo.svg")) await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="14" fill="blue"/></svg>' });
        else await route.fulfill({ status: 404 });
      });
      await page.addInitScript(({ choice }) => {
        localStorage.setItem("iptv-hub.theme.v1", choice);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{
          id: "logos", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: "https://fixture.test/epg.xml",
        }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "logos");
      }, { choice: theme });
      await page.goto("/");
      await expect(page.locator("#channel-list .channel-card").first()).toBeVisible();
      await expect(page.locator("#epg-now")).toBeHidden();
      await checkLogos(page);
      await page.locator("#search").fill("Alpha");
      await expect(page.locator("#channel-list .logo img")).toHaveAttribute("src", "https://fixture.test/logo.svg");
      await page.locator("#search").fill("Logo match");
      await expect(page.locator("#channel-list .channel-card").first()).toContainText("Logo match:");
      await checkLogos(page);
      const rows = page.locator("#channel-list .channel-card");
      await expect(rows.first()).toHaveCSS("height", "72px");
      await page.locator("#search").press("ArrowDown");
      await expect(rows.first()).toBeFocused();
      const request = page.waitForRequest("https://fixture.test/a.mp4");
      await page.keyboard.press("Enter");
      await request;
      await expect(page.locator("#now-title")).toHaveText("Alpha");
      if (width >= 1024) {
        await page.locator("#btn-collapse-list").click();
        await expect(page.locator("#channel-list")).toBeHidden();
        await page.locator("#btn-restore-panel").click();
        await checkLogos(page);
      }
    });
  }
}
