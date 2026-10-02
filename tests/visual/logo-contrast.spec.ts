import { expect, test, type Locator } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function checkContrast(tile: Locator): Promise<void> {
  const img = tile.locator("img");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(36);
  const luminance = await tile.evaluate((el) => {
    const rgb = getComputedStyle(el).backgroundColor;
    const values = rgb.startsWith("color(srgb")
      ? rgb.match(/[\d.]+/g)!.map(Number)
      : rgb.match(/[\d.]+/g)!.slice(0, 3).map((v) => Number(v) / 255);
    const linear = values.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  });
  // Контраст к белым и чёрным деталям одного прозрачного изображения.
  expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(3);
  expect((luminance + 0.05) / 0.05).toBeGreaterThanOrEqual(3);
  expect(await img.evaluate((el) => getComputedStyle(el).filter)).toBe("none");
}

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`контраст прозрачных логотипов (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const names = ["Alpha White", "Beta Black", "Gamma Colour", "Missing", "No image"];
      const logos = ["white.svg", "black.svg", "colour.svg", "missing.svg", ""];
      const base = "https://fixture.test/";
      const m3u = "#EXTM3U\n" + names.map((name, i) =>
        `#EXTINF:-1 tvg-id="${i}"${logos[i] ? ` tvg-logo="${base}${logos[i]}"` : ""},${name}\n${base}${i}.mp4\n`).join("");
      const date = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
      const now = Date.now();
      const xml = "<tv>" + names.map((_, i) => `<programme channel="${i}" start="${date(now - 600000)}" stop="${date(now + 3600000)}"><title>Contrast match</title></programme>`).join("") + "</tv>";
      await page.route(`${base}**`, async (route) => {
        const url = route.request().url();
        if (url.endsWith("playlist.m3u")) await route.fulfill({ body: m3u });
        else if (url.endsWith("epg.xml")) await route.fulfill({ body: xml });
        else if (/\/(white|black|colour)\.svg$/.test(url)) {
          const fill = url.endsWith("white.svg") ? "white" : url.endsWith("black.svg") ? "black" : "#0055ff";
          await route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><path fill="${fill}" d="M4 4h10v28H4zm18 0h10v28H22z"/></svg>` });
        } else await route.fulfill({ status: 404 });
      });
      await page.addInitScript(({ theme, base }) => {
        localStorage.setItem("iptv-hub.theme.v1", theme);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "contrast", name: "Тест", playlistUrl: `${base}playlist.m3u`, epgUrl: `${base}epg.xml` }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "contrast");
        localStorage.setItem("iptv-hub.recents.v1:contrast", JSON.stringify([0, 1, 3, 4].map((i) => `${base}${i}.mp4`)));
      }, { theme, base });
      await page.goto("/");
      const rows = page.locator("#channel-list .channel-card");
      await expect(rows).toHaveCount(5);
      await expect(page.locator("#epg-now")).toBeHidden();
      const checkRows = async (): Promise<void> => {
        for (let i = 0; i < 3; i++) await checkContrast(rows.nth(i).locator(".logo"));
        await expect(rows.nth(3).locator(".logo")).toHaveText("MI");
        await expect(rows.nth(4).locator(".logo")).toHaveText("NO");
        for (let i = 3; i < 5; i++) {
          await expect(rows.nth(i).locator(".logo img")).toHaveCount(0);
          expect(await rows.nth(i).locator(".logo").evaluate((el) => getComputedStyle(el).backgroundColor))
            .toBe(theme === "light" ? "rgb(227, 227, 232)" : "rgb(39, 40, 46)");
        }
        expect((await rows.first().boundingBox())!.height).toBe(72);
      };
      await checkRows();
      const frames = page.locator(".continue-frame");
      await expect(frames).toHaveCount(4);
      await checkContrast(frames.nth(0));
      await checkContrast(frames.nth(1));
      await expect(frames.nth(2).locator("img")).toHaveCount(0);
      await expect(frames.nth(2).locator(".continue-mark")).toHaveText("MI");
      await expect(frames.nth(3).locator(".continue-mark")).toHaveText("NO");
      await page.screenshot({ path: `test-results/logo-contrast-${theme}-${width}.png` });
      await page.locator("#search").fill("Contrast match");
      await expect(rows.first()).toContainText("Contrast match");
      await checkRows();
      const request = page.waitForRequest(`${base}0.mp4`);
      await rows.first().click();
      await request;
      await expect(rows.first()).toHaveClass(/\bon\b/);
      if (width >= 1024) {
        await page.locator("#btn-collapse-list").click();
        await expect(page.locator("#channel-list")).toBeHidden();
        await page.locator("#btn-restore-panel").click();
        await checkRows();
        await expect(rows.first()).toHaveClass(/\bon\b/);
      }
    });
  }
}
