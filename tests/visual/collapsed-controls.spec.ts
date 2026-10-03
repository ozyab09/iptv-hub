import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("all rail sections reveal their screens; menu can return without playback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    if (localStorage.getItem("iptv-hub.playlists.v1")) return;
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "menu", name: "Menu", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "menu");
  });
  await page.route("https://fixture.test/**", (route) => route.request().url().endsWith("playlist.m3u")
    ? route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Alpha\nhttps://fixture.test/a.mp4\n" }) : route.fulfill({ status: 404 }));
  await page.goto("/");
  await page.locator("#channel-list .channel-card").click();
  const app = page.locator("#app");
  const toggle = page.locator("#btn-collapse-list");
  for (const label of ["Channels", "Favorites", "Recent", "Recordings", "Settings"]) {
    await toggle.click();
    await expect(page.locator(".screens")).toBeHidden();
    await page.locator("#side-nav button").filter({ hasText: label }).click();
    await expect(app).not.toHaveClass(/list-collapsed|panel-hidden/);
    await expect(page.locator(".screens")).toBeVisible();
    await expect(page.locator('#side-nav [aria-current="page"]')).toContainText(label);
    await expect(toggle).toBeVisible();
    const box = (await toggle.boundingBox())!;
    expect(box.x).toBeLessThan(72);
    expect(box.y).toBeGreaterThan(700);
    await page.locator("#btn-hide-panel").click();
    await expect(page.locator("#btn-show-menu")).toBeVisible();
    await page.locator("#btn-show-menu").click();
    await expect(page.locator(".screens")).toBeVisible();
  }
  await page.keyboard.press("c");
  await expect(page.locator("#setup-screen")).toBeHidden();
  await page.keyboard.press("c");
  await expect(page.locator("#setup-screen")).toBeVisible();
  await page.locator("#btn-hide-panel").click();
  await page.locator("#btn-close-player").click();
  await expect(page.locator("#player-bar")).toBeHidden();
  const restore = page.getByRole("button", { name: "Show menu", exact: true });
  await expect(restore).toBeVisible();
  await page.reload();
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page.locator(".screens")).toBeVisible();
  await expect(toggle).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.panel-hidden.v1"))).toBe("0");
  await page.keyboard.press("c");
  await expect(page.locator(".screens")).toBeHidden();
  await page.keyboard.press("c");
  await expect(page.locator(".screens")).toBeVisible();
});

async function checkCollapsed(page: Page): Promise<void> {
  await expect(page.locator(".screens")).toBeHidden();
  await expect(page.locator(".sidebar")).toBeVisible();
  expect(await page.locator("#app").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ")[1])).toBe("0px");
  await expect(page.locator("#btn-restore-panel")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const theme of ["light", "dark"]) {
  for (const width of [1024, 1280, 1440]) {
    test(`список полностью скрыт и возвращается (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => {
        localStorage.setItem("iptv-hub.theme.v1", theme);
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "controls", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "controls");
      }, theme);
      const playlist = "#EXTM3U\n" + Array.from({ length: 150 }, (_, i) =>
        `#EXTINF:-1 group-title="${i < 120 ? "Main" : "Other"}",Channel ${String(i).padStart(3, "0")}\nhttps://fixture.test/${i}.mp4\n`).join("");
      await page.route("https://fixture.test/**", (route) => route.request().url().endsWith("playlist.m3u")
        ? route.fulfill({ body: playlist }) : route.fulfill({ status: 404 }));
      await page.goto("/");
      const list = page.locator("#channel-list");
      await list.locator(".channel-card").first().click();
      await page.locator("#btn-categories").click();
      await page.locator("#cat-menu .menu-item").filter({ hasText: "Other" }).click();
      await expect(page.locator("#view-count")).toHaveText("30");
      await list.evaluate((el) => { el.scrollTop = 720; });
      const before = await list.evaluate((el) => el.scrollTop);
      const playerWidth = (await page.locator("#player-bar").boundingBox())!.width;
      const app = page.locator("#app");
      await page.locator("#btn-collapse-list").click();
      await checkCollapsed(page);
      await expect(page.locator("#btn-collapse-list")).toBeFocused();
      expect((await page.locator("#player-bar").boundingBox())!.width).toBe(playerWidth + 368);
      await page.screenshot({ path: test.info().outputPath("collapsed-list.png") });
      await page.locator("#video-stage").evaluate((el) => el.classList.add("idle"));
      expect(await page.locator("#btn-restore-panel").evaluate((el) => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (getComputedStyle(node).opacity === "0") return false;
        }
        return true;
      })).toBe(true);
      await page.locator("#btn-restore-panel").click();
      await expect(app).not.toHaveClass(/list-collapsed/);
      await expect(page.locator("#view-count")).toHaveText("30");
      expect(await list.evaluate((el) => el.scrollTop)).toBe(before);
      await expect(list.locator('[data-channel-url="https://fixture.test/130.mp4"]')).toBeInViewport();
      await expect(page.locator("#btn-collapse-list")).toBeFocused();
      await page.keyboard.press("c");
      await checkCollapsed(page);
      await page.keyboard.press("c");
      await expect(list).toBeVisible();
      expect(await list.evaluate((el) => el.scrollTop)).toBe(before);
      await page.keyboard.press("c");
      await page.locator("#btn-hide-panel").focus();
      await expect(page.locator("#btn-hide-panel")).toBeFocused();
      expect(await page.locator("#btn-hide-panel").evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      await page.keyboard.press("Enter");
      await expect(app).toHaveClass(/panel-hidden/);
      await expect(page.locator(".sidebar")).toBeHidden();
      await page.keyboard.press("c");
      await expect(app).not.toHaveClass(/panel-hidden|list-collapsed/);
      expect(await list.evaluate((el) => el.scrollTop)).toBe(before);
      await page.locator("#btn-collapse-list").click();
      expect(await page.evaluate(() => localStorage.getItem("iptv-hub.list-collapsed.v1"))).toBe("1");
      await page.reload();
      await expect(app).toHaveClass(/list-collapsed/);
      await page.locator("#btn-collapse-list").click();
      await list.locator(".channel-card").first().click();
      await page.locator("#btn-collapse-list").click();
      await checkCollapsed(page);
      await page.locator("#btn-hide-panel").click();
      await page.locator("#btn-restore-panel").click();
      await expect(list).toBeVisible();
      await expect(page.locator(".sidebar")).toBeVisible();
    });
  }
}
