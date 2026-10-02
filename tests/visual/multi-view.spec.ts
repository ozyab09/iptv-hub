import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function openChannels(page: Page, width: number, theme = "dark"): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  const segment = readFileSync("tests/fixtures/recording.mpegts");
  const playlist = Array.from({ length: 4 }, (_, i) => `#EXTINF:-1,Канал ${i + 1}\nhttps://fixture.test/${i + 1}/live.m3u8`).join("\n");
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: `#EXTM3U\n${playlist}\n` });
    if (url.endsWith(".ts")) return route.fulfill({ body: segment, contentType: "video/mp2t" });
    return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4,\none.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\ntwo.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\nthree.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:4,\nfour.ts\n#EXT-X-ENDLIST\n" });
  });
  await page.addInitScript((theme) => {
    localStorage.setItem("iptv-hub.theme.v1", theme);
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([
      { id: "one", name: "Первый", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null },
      { id: "two", name: "Второй", playlistUrl: "https://fixture.test/other/playlist.m3u", epgUrl: null },
    ]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    const state = window as unknown as { mediaUrls: string[]; revokedUrls: string[] };
    state.mediaUrls = [];
    state.revokedUrls = [];
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (source) => {
      const url = create(source);
      if (source instanceof MediaSource) state.mediaUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => { state.revokedUrls.push(url); revoke(url); };
  }, theme);
  await page.goto("/");
  await page.locator("#channel-list .channel-card").first().click();
  await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
}

async function fillGrid(page: Page): Promise<void> {
  await page.locator("#btn-multi-view").click();
  for (let i = 1; i < 4; i++) {
    await page.locator(".multi-select").nth(i).click();
    await page.locator("#channel-list .channel-card").nth(i).click();
  }
  await expect.poll(() => page.locator(".multi-grid video").evaluateAll((els) => els.filter((el) => (el as HTMLVideoElement).videoWidth === 160 && !(el as HTMLVideoElement).paused).length)).toBe(4);
}

for (const [theme, width] of [["light", 1024], ["dark", 1440]] as const) {
  test(`4 HLS-потока, звук и освобождение сетки (${theme}, ${width}px)`, async ({ page }, testInfo) => {
    await openChannels(page, width, theme);
    await fillGrid(page);
    await expect(page.locator(".multi-select")).toHaveCount(4);
    await expect(page.locator("#video")).toHaveJSProperty("paused", true);
    const frames = await page.locator(".multi-grid video").evaluateAll((els) => els.map((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(el as HTMLVideoElement, 0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data[2]! > 200;
    }));
    expect(frames).toEqual([true, true, true, true]);
    await page.locator(".multi-select").nth(1).click();
    await expect(page.locator(".multi-select").nth(1)).toHaveAttribute("aria-pressed", "true");
    const sound = (): Promise<number[]> => page.locator(".multi-grid video").evaluateAll((els) => els.map((el) => { const v = el as HTMLVideoElement; return v.muted ? 0 : v.volume; }));
    expect(await sound()).toEqual([0, 1, 0, 0]);
    await page.locator("#multi-mute").click();
    expect(await sound()).toEqual([0, 0, 0, 0]);
    await page.locator("#multi-mute").click();
    expect(await sound()).toEqual([0, 1, 0, 0]);
    await page.locator("#multi-pause").click();
    await expect(page.locator(".multi-grid video").nth(1)).toHaveJSProperty("paused", true);
    await expect(page.locator(".multi-grid video").nth(0)).toHaveJSProperty("paused", false);
    await page.locator("#multi-pause").click();
    const tiles = await page.locator(".multi-tile").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    expect(tiles[0]!.y).toBe(tiles[1]!.y);
    expect(tiles[2]!.y).toBe(tiles[3]!.y);
    expect(tiles[2]!.y).toBeGreaterThan(tiles[0]!.y + tiles[0]!.height);
    expect(tiles[1]!.x).toBeGreaterThan(tiles[0]!.x + tiles[0]!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("multi-view.png") });
    await page.locator("#multi-volume").evaluate((el) => { const input = el as HTMLInputElement; input.value = "35"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    const gridUrls = await page.evaluate(() => (window as unknown as { mediaUrls: string[] }).mediaUrls.slice(-4));
    expect(gridUrls).toHaveLength(4);
    await page.locator("#multi-exit").click();
    await expect(page.locator("#multi-view")).toBeHidden();
    await expect(page.locator("#now-title")).toHaveText("Канал 2");
    await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
    await expect(page.locator("#video")).toHaveJSProperty("volume", 0.35);
    expect(await page.evaluate((urls) => urls.every((url) => (window as unknown as { revokedUrls: string[] }).revokedUrls.includes(url)), gridUrls)).toBe(true);
    // Повторный вход/выход не оставляет прошлые MSE-источники.
    await page.locator("#btn-multi-view").click();
    await expect.poll(() => page.locator(".multi-grid video").first().evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
    await page.locator("#multi-exit").click();
    await page.locator("#btn-close-player").click();
    expect(await page.evaluate(() => {
      const state = window as unknown as { mediaUrls: string[]; revokedUrls: string[] };
      return state.mediaUrls.every((url) => state.revokedUrls.includes(url));
    })).toBe(true);
  });
}

test("уменьшение окна закрывает сетку и возвращает один поток", async ({ page }) => {
  await openChannels(page, 1440);
  await fillGrid(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator("#multi-view")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Мульти-вью доступно только");
  await expect(page.locator("#now-title")).toHaveText("Канал 4");
  await expect(page.locator(".multi-grid video")).toHaveCount(0);
});

test("смена плейлиста закрывает все окна", async ({ page }) => {
  await openChannels(page, 1440);
  await fillGrid(page);
  await page.locator("#pl-switch-btn").click();
  await page.locator("#pl-switch-menu button").filter({ hasText: "Второй" }).click();
  await expect(page.locator("#multi-view")).toBeHidden();
  await expect(page.locator(".multi-grid video")).toHaveCount(0);
  await expect(page.locator("#player-bar")).toBeHidden();
  expect(await page.evaluate(() => {
    const state = window as unknown as { mediaUrls: string[]; revokedUrls: string[] };
    return state.mediaUrls.every((url) => state.revokedUrls.includes(url));
  })).toBe(true);
});

test("повторный вход восстанавливает сетку; после смены канала — одно окно (#254)", async ({ page }) => {
  await openChannels(page, 1440);
  await fillGrid(page);
  // Активное окно 2 («Канал 2»), выходим: одиночный плеер возобновляет его.
  await page.locator(".multi-select").nth(1).click();
  await page.locator("#multi-exit").click();
  await expect(page.locator("#now-title")).toHaveText("Канал 2");
  // Повторный вход: та же сетка из четырёх каналов и то же активное окно.
  await page.locator("#btn-multi-view").click();
  await expect.poll(() => page.locator(".multi-grid video").evaluateAll((els) => els.filter((el) => (el as HTMLVideoElement).videoWidth === 160 && !(el as HTMLVideoElement).paused).length)).toBe(4);
  await expect(page.locator(".multi-select").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".multi-select").nth(0)).toContainText("Канал 1");
  await expect(page.locator(".multi-select").nth(3)).toContainText("Канал 4");
  await page.locator("#multi-exit").click();
  await expect(page.locator("#now-title")).toHaveText("Канал 2");
  // После выхода включён другой канал — вход начинается только с него.
  await page.locator("#channel-list .channel-card").nth(2).click();
  await expect(page.locator("#now-title")).toHaveText("Канал 3");
  await page.locator("#btn-multi-view").click();
  await expect.poll(() => page.locator(".multi-grid video").evaluateAll((els) => els.filter((el) => (el as HTMLVideoElement).videoWidth === 160 && !(el as HTMLVideoElement).paused).length)).toBe(1);
  await expect(page.locator(".multi-select").nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".multi-select").nth(0)).toContainText("Канал 3");
  await expect(page.locator(".multi-select").nth(1)).toContainText("Выберите канал");
  await page.locator("#multi-exit").click();
  await expect(page.locator("#now-title")).toHaveText("Канал 3");
});

test("на мобильной ширине — явный отказ без дополнительных потоков", async ({ page }) => {
  await openChannels(page, 390);
  await page.locator("#now-title").click();
  await page.locator("#video-stage").hover();
  await page.locator("#btn-multi-view").click();
  await expect(page.locator("#toast")).toContainText("Мульти-вью доступно только");
  await expect(page.locator("#multi-view")).toBeHidden();
  await expect(page.locator(".multi-grid video")).toHaveCount(0);
  await expect(page.locator("#video")).toHaveJSProperty("paused", false);
});
