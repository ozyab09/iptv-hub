import { expect, test, type Page } from "@playwright/test";

async function openWatching(page: Page, theme: string): Promise<void> {
  await page.addInitScript((choice) => {
    localStorage.setItem("iptv-hub.theme.v1", choice);
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{
      id: "test", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null,
    }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "test");
  }, theme);
  await page.route("https://fixture.test/**", (route) => route.fulfill({
    body: "#EXTM3U\n#EXTINF:-1,Тест\nhttps://stream.invalid/live.mp4\n",
  }));
  await page.route("https://stream.invalid/**", (route) => route.fulfill({ status: 404 }));
  await page.goto("/");
  await page.locator("#channel-list .channel-card").first().click();
}

async function navigate(page: Page, text: string): Promise<void> {
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: text, visible: true }).first().click();
}

async function checkSettings(page: Page): Promise<void> {
  const setup = page.locator("#setup-screen");
  await expect(setup).toBeVisible();
  // Проверяем C вне текстовых полей, где её уже блокирует защита ввода.
  await setup.locator(".settings-title").click();
  const bounds = await setup.boundingBox();
  expect(bounds!.width).toBeGreaterThan(250);
  const flags = await page.locator("#app").getAttribute("class");
  for (const key of ["c", "с"]) {
    if (key === "c") await page.keyboard.press(key);
    else await setup.dispatchEvent("keydown", { key, code: "KeyC", bubbles: true });
    expect(await page.locator("#app").getAttribute("class")).toBe(flags);
    expect((await setup.boundingBox())!.width).toBe(bounds!.width);
  }
  const overflowing = await setup.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [...el.querySelectorAll<HTMLElement>("button, input, .seg, .group")]
      .filter((child) => child.checkVisibility())
      .filter((child) => { const b = child.getBoundingClientRect(); return b.left < r.left - 1 || b.right > r.right + 1; })
      .map((child) => child.id || child.textContent?.trim());
  });
  expect(overflowing).toEqual([]);
  await setup.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(setup.locator(".hint summary")).toBeInViewport();
}

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1280, 1440]) {
    test(`настройки при просмотре: C и границы (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 600 });
      await openWatching(page, theme);
      await navigate(page, "Настройки");
      await checkSettings(page);
      await page.locator("#btn-add-pl").click();
      await checkSettings(page);
      await page.locator("#setup-screen .pl-act:not(.pl-del)").first().click();
      await checkSettings(page);
      if (width < 1024) return;
      await navigate(page, "Каналы");
      await page.locator("#btn-collapse-list").click();
      await navigate(page, "Настройки");
      await checkSettings(page);
      await navigate(page, "Каналы");
      await expect(page.locator("#app")).toHaveClass(/channel-view.*list-collapsed|list-collapsed.*channel-view/);
      expect((await page.locator(".screens").boundingBox())!.width).toBe(64);
      await page.locator("#btn-hide-panel").click();
      await expect(page.locator(".screens")).toBeHidden();
      await page.keyboard.press("c");
      await expect(page.locator(".screens")).toBeVisible();
      await navigate(page, "Настройки");
      await checkSettings(page);
    });
  }
}
