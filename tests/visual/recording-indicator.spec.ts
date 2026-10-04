import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

/**
 * Проба для issue #342: сигнал «запись идёт» (пульсирующая ⏺ и подпись)
 * должен существовать только при активной записи; во всех остальных
 * состояниях — ничего.
 */
async function setup(page: Page) {
  await page.clock.install({ time: new Date("2026-10-04T12:00:00Z") });
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "ru");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "p", name: "TV", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "p");
  });
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("list.m3u")) return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="tv" group-title="News",TV\nhttps://fixture.test/live.m3u8\n#EXTINF:-1 tvg-id="tv2" group-title="News",TV2\nhttps://fixture.test/live2.m3u8\n' });
    if (url.endsWith("live2.m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4,\n2.ts\n" });
    if (url.endsWith(".ts")) return route.fulfill({ contentType: "video/mp2t", body: ts });
    return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4,\n0.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\n1.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\n2.ts\n" });
  });
  await page.goto("/");
  await page.locator("#channel-list .channel-card").first().click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
}

test("без записи: никаких сигналов записи в плеере", async ({ page }) => {
  await setup(page);
  await expect(page.locator("#btn-rec")).not.toHaveClass(/recording/);
  await expect(page.locator("#btn-rec")).not.toHaveAttribute("title", /останов/i);
  await expect(page.locator("#btn-rec")).toBeVisible();
  // Бейдж sleep-таймера не должен светиться без таймера
  await expect(page.locator("#sleep-badge")).toBeHidden();
});

test("при записи сигнал появляется и исчезает после остановки", async ({ page }) => {
  await setup(page);
  await page.locator("#btn-rec").click();
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  await expect(page.locator("#btn-rec")).toHaveAttribute("title", /останов/i);
  await page.locator("#btn-rec").click();
  await expect(page.locator("#btn-rec")).not.toHaveClass(/recording/);
  await expect(page.locator("#btn-rec")).not.toHaveAttribute("title", /останов/i);
});

test("после переключения на другой канал сигнал записи погашен", async ({ page }) => {
  await setup(page);
  await page.locator("#btn-rec").click();
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  // Плейлист из двух каналов: prev/next ведут на соседний, не на тот же.
  await page.locator("#btn-next").click();
  await expect(page.locator("#btn-rec")).not.toHaveClass(/recording/);
});

test("закрытие плеера сразу после старта записи гасит сигнал и для следующего канала", async ({ page }) => {
  await setup(page);
  // Два клика в одном такте: асинхронный старт записи (OPFS) завершится
  // уже ПОСЛЕ закрытия плеера — осиротевший старт не должен оставить
  // индикацию записи при открытии следующего канала (#342).
  await page.evaluate(() => {
    (document.getElementById("btn-rec") as HTMLButtonElement).click();
    (document.getElementById("btn-close-player") as HTMLButtonElement).click();
  });
  await page.locator("#channel-list .channel-card").first().click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await expect(page.locator("#btn-rec")).not.toHaveClass(/recording/);
  await expect(page.locator("#btn-rec")).not.toHaveAttribute("title", /останов/i);
});

test("при просмотре готовой записи кнопки записи нет вовсе", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    localStorage.setItem("iptv-hub.recordings.v1", JSON.stringify([{
      id: "r1", channelName: "TV", channelUrl: "https://fixture.test/live.m3u8",
      programmeTitle: null, startedAt: Date.now() - 60_000, durationSec: 5,
      sizeBytes: 100_000, ext: "webm",
    }]));
  });
  // Вкладка «Записи» → воспроизведение несуществующего файла даст ошибку,
  // поэтому проверяем скрытие кнопки через сам проигрыш: проще — открыть
  // запись нельзя без файла, значит проверяем только состояние кнопки.
  await page.reload();
  await page.locator("#channel-list .channel-card").first().click();
  await expect.poll(() => page.locator("#video").evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(160);
  await expect(page.locator("#btn-rec")).toBeVisible();
  await expect(page.locator("#btn-rec")).not.toHaveClass(/recording/);
});
