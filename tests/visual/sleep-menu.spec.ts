import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const playlist = "#EXTM3U\n#EXTINF:-1,Канал\nhttps://stream.invalid/live.mp4\n";

async function setup(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "iptv-hub.playlists.v1",
      JSON.stringify([{ id: "sleep", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]),
    );
    localStorage.setItem("iptv-hub.active-playlist.v1", "sleep");
  });
  await page.route("https://fixture.test/**", (route) => route.fulfill({ body: playlist }));
  await page.route("https://stream.invalid/**", (route) => route.fulfill({ status: 404 }));
}

/** Меню целиком лежит внутри хоста (кадра или экрана). */
async function expectInside(page: Page, menuSel: string, hostSel: string): Promise<void> {
  const menu = (await page.locator(menuSel).boundingBox())!;
  const host = (await page.locator(hostSel).boundingBox())!;
  expect(menu.width).toBeGreaterThan(0);
  expect(menu.height).toBeGreaterThan(0);
  expect(menu.x).toBeGreaterThanOrEqual(host.x - 0.5);
  expect(menu.y).toBeGreaterThanOrEqual(host.y - 0.5);
  expect(menu.x + menu.width).toBeLessThanOrEqual(host.x + host.width + 0.5);
  expect(menu.y + menu.height).toBeLessThanOrEqual(host.y + host.height + 0.5);
}

async function expectStyled(page: Page): Promise<void> {
  const menu = page.locator("#sleep-menu");
  await expect(menu).toHaveClass(/sleep-menu/);
  // Стили применены: без класса меню было бы статичным блоком с дефолтными кнопками.
  expect(await menu.evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
  expect(await menu.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0.92)");
  expect(await menu.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe("0px");
  await expect(menu.locator("button")).toHaveCount(5);
}

test("меню sleep-таймера стилизовано, внутри кадра и не перекрывает деку (десктоп)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.goto("/");
  await page.locator("#channel-list .channel-card").first().click();
  const menu = page.locator("#sleep-menu");
  await expect(menu).toBeHidden();

  await page.locator("#btn-sleep").click();
  await expect(menu).toBeVisible();
  await expectStyled(page);
  await expectInside(page, "#sleep-menu", "#video-stage");
  // На широком экране меню встаёт над транспортной декой, не заходя на неё.
  const box = (await menu.boundingBox())!;
  const transport = (await page.locator(".video .transport").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(transport.y + 1);

  // Escape закрывает меню (не сворачивая страницу плеера).
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#player-bar")).not.toHaveClass(/open/);

  // Клик мимо закрывает.
  await page.locator("#btn-sleep").click();
  await expect(menu).toBeVisible();
  await page.locator("#video-stage").click({ position: { x: 40, y: 40 } });
  await expect(menu).toBeHidden();

  // Выбор пункта применяет его и закрывает меню.
  await page.locator("#btn-sleep").click();
  await menu.locator("button[data-sleep='off']").click();
  await expect(menu).toBeHidden();
});

test("меню sleep-таймера целиком помещается в кадр (390px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/");
  await page.locator("#channel-list .channel-card").first().click();
  const menu = page.locator("#sleep-menu");

  // Мини-плеер: меню всплывает над баром и не выходит за экран.
  await page.locator("#btn-sleep").click();
  await expect(menu).toBeVisible();
  await expectStyled(page);
  await expectInside(page, "#sleep-menu", "body");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // Страница плеера: меню внутри кадра. Тап по имени канала разворачивает
  // мини-плеер (координаты хрупки: слева от имени лежит видео-превью,
  // клик по нему только ставит паузу).
  await page.locator("#now-title").click();
  await expect(page.locator("#player-bar")).toHaveClass(/open/);
  await page.locator("#btn-sleep").click();
  await expect(menu).toBeVisible();
  await expectStyled(page);
  await expectInside(page, "#sleep-menu", "#video-stage");
});
