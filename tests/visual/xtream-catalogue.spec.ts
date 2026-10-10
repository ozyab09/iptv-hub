import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  test(`optional movies, series, search and resume (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("iptv-hub.language.v1", "en"));
    const requests: string[] = [];
    const media = readFileSync("tests/fixtures/catalogue.mp4");
    await page.route("https://provider.test/**", (route) => {
      const url = new URL(route.request().url());
      requests.push(url.href);
      if (url.pathname.endsWith("xmltv.php")) return route.fulfill({ body: "<tv/>" });
      if (url.pathname.endsWith(".mp4")) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? "");
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
        return route.fulfill({ status: range ? 206 : 200, body: media.subarray(start, end + 1), contentType: "video/mp4",
          headers: { "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${media.length}` } : {}) } });
      }
      const categories = [{ category_id: "1", category_name: "Catalogue" }];
      const bodies: Record<string, unknown> = {
        get_live_streams: [{ stream_id: 1, name: "Live fixture", category_id: "1", stream_type: 1 }],
        get_live_categories: categories,
        get_vod_streams: Array.from({ length: 200 }, (_, index) => ({ stream_id: 10 + index, name: `Movie ${String(index).padStart(3, "0")}`, category_id: "1", container_extension: "mp4" })),
        get_vod_categories: categories,
        get_series: [{ series_id: 20, name: "Series fixture", category_id: "1" }],
        get_series_categories: categories,
        get_series_info: { episodes: { "1": [
          { id: 21, title: "Episode one", episode_num: 1, container_extension: "mp4" },
          { id: 22, title: "Episode two", episode_num: 2, container_extension: "mp4" },
        ] } },
      };
      return route.fulfill({ json: bodies[url.searchParams.get("action")!] ?? [] });
    });
    const nav = (name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first();
    await page.goto("/");
    await page.getByRole("radio", { name: "Xtream Codes", exact: true }).click();
    await expect(page.locator("#xtream-vod")).not.toBeChecked();
    await page.locator("#xtream-host").fill("https://provider.test");
    await page.locator("#xtream-user").fill("user");
    await page.locator("#xtream-password").fill("secret");
    await page.locator("#xtream-vod").check();
    await page.locator("#setup-load").click();
    await expect(page.locator("#channel-list .channel-card")).toContainText("Live fixture");
    expect(requests.filter((url) => new URL(url).searchParams.get("action")?.startsWith("get_")).length).toBe(6);
    await nav("Movies").click();
    const posters = page.locator(".catalogue-card");
    await expect(posters.first()).toContainText("Movie 000");
    expect(await posters.count()).toBeLessThan(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await posters.first().click();
    await expect.poll(() => page.locator("#video").evaluate((node) => (node as HTMLVideoElement).videoWidth)).toBe(160);
    if (width < 1024) await page.locator("#player-bar").click();
    await expect(page.locator("#btn-live")).toBeHidden();
    await page.locator("#video").evaluate(async (node) => {
      const video = node as HTMLVideoElement;
      await new Promise<void>((resolve) => { video.addEventListener("seeked", () => resolve(), { once: true }); video.currentTime = 20; });
      video.pause();
    });
    await page.locator("#btn-close-player").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.positions.v1") ?? "{}")["https://provider.test/movie/user/secret/10.mp4"]?.t)).toBeGreaterThanOrEqual(20);
    await posters.first().click();
    await expect.poll(() => page.locator("#video").evaluate((node) => (node as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(20);
    if (width < 1024) await page.locator("#player-bar").click();
    await page.locator("#btn-close-player").click();
    await nav("Channels").click();
    await page.locator("#search").fill("Movie 000");
    await expect(page.locator("#channel-list .channel-card")).toContainText("Movie 000");
    await page.locator("#search").fill("Series fixture");
    await expect(page.locator("#channel-list .channel-card")).toContainText("Series fixture");
    await page.locator("#search").fill("");
    await nav("Series").click();
    await posters.first().click();
    await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
    await expect.poll(() => requests.some((url) => url.endsWith("/series/user/secret/21.mp4"))).toBe(true);
    await expect.poll(() => page.locator("#video").evaluate((node) => {
      const video = node as HTMLVideoElement;
      return video.currentSrc.endsWith("/21.mp4") && video.readyState >= 2 && video.videoWidth === 160;
    })).toBe(true);
    if (width < 1024) await page.locator("#player-bar").click();
    await expect(page.locator("#btn-next-episode")).toBeVisible();
    if (width === 1440) await page.locator("#video").dispatchEvent("ended");
    else {
      // locator.click() в Firefox глушится hit-target interceptor'ом Playwright
      // для этой динамически показанной кнопки (#441): при «успешном» клике
      // события ввода не доходят до страницы. Клик по координатам — реальные
      // trusted-события; если кнопку перекрыло, клик промахнётся и тест упадёт.
      const box = (await page.locator("#btn-next-episode").boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect.poll(() => page.locator("#video").evaluate((node) => {
      const video = node as HTMLVideoElement;
      return { source: video.currentSrc, ready: video.readyState >= 2, width: video.videoWidth, error: video.error?.message ?? null };
    })).toMatchObject({ source: "https://provider.test/series/user/secret/22.mp4", ready: true, width: 160, error: null });
    await expect.poll(() => requests.some((url) => url.endsWith("/series/user/secret/22.mp4"))).toBe(true);
    await expect(page.locator("#btn-next-episode")).toBeHidden();
    await page.locator("#btn-close-player").click();
    await page.reload();
    await nav("Series").click();
    await posters.first().click();
    await expect.poll(() => page.locator("#video").evaluate((node) => (node as HTMLVideoElement).currentSrc)).toContain("/22.mp4");
    if (width < 1024) await page.locator("#player-bar").click();
    await page.locator("#btn-close-player").click();
    await nav("Settings").click();
    await page.locator(".pl-act:not(.pl-del)").first().click();
    await page.locator('.pl-edit input[type="checkbox"]').uncheck();
    await page.locator('.pl-edit button[type="submit"]').click();
    await expect(nav("Movies")).toHaveCount(0);
    await expect(nav("Series")).toHaveCount(0);
    // После снятия opt-in плейлист перезагружается без каталога: ждём одну
    // карточку эфира. Прямой toContainText на двух старых карточках эпизодов
    // падал бы сразу strict mode violation, не дожидаясь перезагрузки (#480).
    await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
    await expect(page.locator("#channel-list .channel-card")).toContainText("Live fixture");
  });
}
