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

/** Развернуть мини-плеер в страницу; на десктопе страницы нет — no-op. */
async function expandPlayerPage(page: Page): Promise<void> {
  const compact = await page.evaluate(() => window.matchMedia("(max-width: 1023px)").matches);
  if (!compact) return;
  if (!(await page.locator("#player-bar").evaluate((el) => el.classList.contains("open")))) {
    // Тап по имени канала разворачивает мини-плеер: координаты хрупки,
    // слева от имени лежит видео-превью, клик по нему только ставит паузу.
    await page.locator("#now-title").click();
  }
  await expect(page.locator("#player-bar")).toHaveClass(/open/);
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

/** Критерий приёмки: меню не перекрывает транспортную деку. */
async function expectAboveTransport(page: Page): Promise<void> {
  const menu = (await page.locator("#sleep-menu").boundingBox())!;
  const transport = (await page.locator(".video .transport").boundingBox())!;
  expect(menu.y + menu.height).toBeLessThanOrEqual(transport.y + 1);
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

/** Контролы на видео всегда белые по чёрному — тема не должна их менять. */
async function menuColors(page: Page): Promise<{ bg: string; color: string }> {
  return page.locator("#sleep-menu").evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el.querySelector("button")!).color,
  }));
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
  await expectAboveTransport(page);

  // Escape закрывает меню (не сворачивая страницу плеера).
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#player-bar")).not.toHaveClass(/open/);

  // Клик мимо закрывает. Точка — левый край кадра на середине высоты:
  // верх занял перенесённый в .top гайд (#btn-guide), центр — меню.
  await page.locator("#btn-sleep").click();
  await expect(menu).toBeVisible();
  const stage = (await page.locator("#video-stage").boundingBox())!;
  await page.mouse.click(stage.x + 20, stage.y + stage.height / 2);
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

  // Страница плеера: меню внутри кадра и не перекрывает транспорт.
  await expandPlayerPage(page);
  await page.locator("#btn-sleep").click();
  await expect(menu).toBeVisible();
  await expectStyled(page);
  await expectInside(page, "#sleep-menu", "#video-stage");
  await expectAboveTransport(page);

  // Сворачивание страницы в мини (в приложении это свайп вниз, который не
  // генерирует клик по документу) оставляет открытое меню на экране: кадр
  // в мини растворяется, и без явного правила max-height схлопнул бы его.
  await page.evaluate(() => document.getElementById("player-bar")!.classList.remove("open"));
  await expect(menu).toBeVisible();
  await expectStyled(page);
  await expectInside(page, "#sleep-menu", "body");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("320px: меню не выходит за кадр, не перекрывает транспорт и одинаково в обеих темах", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await setup(page);
  await page.goto("/");
  await page.locator("#channel-list .channel-card").first().click();
  await expandPlayerPage(page);
  const menu = page.locator("#sleep-menu");

  await page.locator("#btn-sleep").click();
  await expect(menu).toBeVisible();
  await expectStyled(page);
  await expectInside(page, "#sleep-menu", "#video-stage");
  await expectAboveTransport(page);

  // Обе темы: попап остаётся белым по чёрному — как и все контролы на видео.
  const applyTheme = (theme: "light" | "dark") =>
    page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      document.documentElement.style.colorScheme = value;
    }, theme);
  await applyTheme("dark");
  const dark = await menuColors(page);
  await applyTheme("light");
  const light = await menuColors(page);
  expect(light).toEqual(dark);
  expect(dark.color).toBe("rgb(255, 255, 255)");
  expect(dark.bg).toBe("rgba(0, 0, 0, 0.92)");
});
