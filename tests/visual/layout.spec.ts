/**
 * Дымовая вёрстка в CI (issue #122): мобильный портрет/пейзаж и десктоп
 * против продакшен-сборки (`npm run build` + `vite preview`).
 *
 * Это НЕ пиксельные снепшоты (их стабилизация — отдельная история), а
 * структурные проверки: приложение поднялось, нет горизонтального
 * переполнения (каскадные баги #82–#87 были именно про наезды), таб-бар
 * и сайдбар на своих местах, строки каналов не слипаются.
 *
 * Запуск: npx playwright test (требует `npm run build` заранее; в CI —
 * отдельный job). Локально браузеры ставятся `npx playwright install chromium`.
 */
import { expect, test } from "@playwright/test";

test.describe("мобильный портрет", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("нет горизонтального переполнения", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("первый экран настроек открывается без наездов", async ({ page }) => {
    await page.goto("/");
    const h1 = page.locator("h1");
    await expect(h1.first()).toBeVisible();
    const box = await h1.first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
  });
});

test.describe("мобильный пейзаж", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("нет горизонтального переполнения", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("дека плеера: ползунок громкости (issue #155)", () => {
  /**
   * Бар с декой открывается только у играющего канала — без сети эмулируем:
   * подменяем fetch на минимальный M3U с одним каналом с data-URL «потоком».
   * Плеер начнёт играть (и зафейлится) — но дека уже в DOM и измеряется.
   */
  async function openPlayerBar(page: import("@playwright/test").Page): Promise<void> {
    // URL канала — гарантированно несуществующий хост (.invalid по RFC 2606):
    // парсер требует схему ://, плеер начнёт играть и зафейлится — но дека
    // уже в DOM и мы меряем именно вёрстку, не воспроизведение.
    const m3u =
      "#EXTM3U\n" +
      '#EXTINF:-1 tvg-id="ch1" group-title="Тест",Тестовый канал\n' +
      "https://stub.invalid/stream.m3u8\n";
    await page.addInitScript((playlist: string) => {
      window.localStorage.setItem(
        "iptv-hub.playlists.v1",
        JSON.stringify([
          { id: "t1", name: "Тест", playlistUrl: "https://test.local/pl.m3u", epgUrl: null },
        ]),
      );
      window.localStorage.setItem("iptv-hub.active-playlist.v1", "t1");
      const realFetch = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
        String(input).includes("test.local")
          ? Promise.resolve(
              new Response(playlist, {
                status: 200,
                headers: { "content-type": "application/vnd.apple.mpegurl" },
              }),
            )
          : realFetch(input as RequestInfo, init);
    }, m3u);
    await page.goto("/");
    await page.locator("#app").waitFor();
    // Канал в списке → клик открывает плеер-бар с декой.
    const card = page.locator(".channel-card").first();
    await card.waitFor({ state: "visible", timeout: 10_000 });
    await card.click();
    await page.locator("#player-bar").waitFor({ state: "visible", timeout: 10_000 });
  }

  for (const vp of [
    { name: "мини 480", width: 480, height: 800 },
    { name: "портрет 390", width: 390, height: 844 },
    { name: "пейзаж 844", width: 844, height: 390 },
    { name: "десктоп 1280", width: 1280, height: 800 },
  ]) {
    test.describe(`${vp.name}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test("ползунок не наезжает на кнопки справа", async ({ page }) => {
        await openPlayerBar(page);

        const slider = page.locator("#volume-slider");
        if (!(await slider.isVisible())) return; // <720px слайдер скрыт — норма
        const s = await slider.boundingBox();
        const right = page.locator(".video-actions-right");
        const r = await right.boundingBox();
        expect(s).not.toBeNull();
        expect(r).not.toBeNull();
        // Перекрытие: правый край ползунка не заходит на левый край правой группы
        // (допуск 1px на субпиксельное округление).
        expect(s!.x + s!.width).toBeLessThanOrEqual(r!.x + 1);
      });
    });
  }
});

test.describe("десктоп", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("каркас без переполнения; сайдбар, когда виден, — слева", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // На первом экране (плейлистов нет) сайдбар скрыт — это норма. Если
    // виден — обязан прилипать к левому краю.
    const sidebar = page.locator(".sidebar");
    if (await sidebar.isVisible()) {
      const box = await sidebar.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeLessThan(100);
    }
  });
});
