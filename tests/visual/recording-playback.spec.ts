import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const { kind, width } of [
  ...[390, 1440].flatMap((width) => ["ts", "mp4"].map((kind) => ({ kind, width }))),
  { kind: "invalid-ts", width: 1440 },
]) {
  test(kind === "invalid-ts" ? "нечитаемая TS-запись показывает ошибку" : `запись ${kind}, ${width}px: кадр, звук, управление и возврат к эфиру`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const ext = kind === "invalid-ts" ? "ts" : kind;
    const bytes = kind === "invalid-ts" ? [0, 1, 2, 3] : [...readFileSync(`tests/fixtures/recording.${ext === "ts" ? "mpegts" : ext}`)];
    await page.goto("/");
    await page.evaluate(async ({ bytes, ext }) => {
      const id = "fixture";
      const dir = await navigator.storage.getDirectory();
      const file = await dir.getFileHandle(`done-${id}.${ext}`, { create: true });
      const sink = await file.createWritable();
      await sink.write(new Uint8Array(bytes));
      await sink.close();
      localStorage.setItem("iptv-hub.recordings.v1", JSON.stringify([{
        id, channelName: "Тест записи", channelUrl: "", programmeTitle: null,
        startedAt: 1000, durationSec: 4, sizeBytes: bytes.length, ext,
      }]));
      localStorage.setItem("iptv-hub.view.v1", "recordings");
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{
        id: "test", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null,
      }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "test");
    }, { bytes, ext });
    await page.route("https://fixture.test/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("playlist.m3u")) return route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Канал\nhttps://fixture.test/live.m3u8\n" });
      if (url.endsWith(".ts")) return route.fulfill({ contentType: "video/mp2t", body: readFileSync("tests/fixtures/recording.mpegts") });
      const entries = Array.from({ length: 8 }, (_, i) => `#EXT-X-DISCONTINUITY\n#EXTINF:4,\n${i}.ts`).join("\n");
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-TARGETDURATION:4\n${entries}\n#EXT-X-ENDLIST\n` });
    });
    await page.reload();
    // Проверяем освобождение локальных URL при закрытии записи.
    await page.evaluate(() => {
      const revoke = URL.revokeObjectURL.bind(URL);
      (window as unknown as { revoked: string[] }).revoked = [];
      URL.revokeObjectURL = (url) => { (window as unknown as { revoked: string[] }).revoked.push(url); revoke(url); };
    });
    const nav = (name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first();
    if (kind !== "invalid-ts") {
      await nav("Каналы").click();
      await page.locator("#channel-list .channel-card").click();
      await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
      await nav("Записи").click();
      // Открытое меню и активный таймер эфира не должны остаться у файла.
      await page.locator("#btn-sleep").dispatchEvent("click");
      await page.locator('[data-sleep="30"]').dispatchEvent("click");
      await expect(page.locator("#sleep-badge")).not.toHaveJSProperty("hidden", true);
      await page.locator("#btn-sleep").dispatchEvent("click");
    }
    await page.locator(".recording-play").dispatchEvent("click");
    if (kind === "invalid-ts") {
      await expect(page.locator("#toast")).toContainText("Браузер не смог воспроизвести запись");
      return;
    }
    const video = page.locator("#video");
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeGreaterThan(0.1);
    await expect.poll(() => video.evaluate((el) => {
      const v = el as HTMLVideoElement;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(v, 0, 0, 1, 1);
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      return pixel[2]! > 200 && pixel[0]! < 30;
    })).toBe(true);
    const hasAudio = await video.evaluate((el) => {
      const v = el as HTMLVideoElement & { mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number };
      return v.mozHasAudio ?? (v.webkitAudioDecodedByteCount ?? 0) > 0;
    });
    expect(hasAudio).toBe(true);
    await expect(page.locator("#quality-btn")).toBeDisabled();
    await expect(page.locator("#quality-btn")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#btn-live")).toBeDisabled();
    await expect(page.locator("#btn-live")).toHaveAttribute("aria-disabled", "true");
    for (const id of ["btn-rec", "btn-sleep", "sleep-menu", "sleep-badge"]) {
      await expect(page.locator(`#${id}`)).toBeHidden();
    }
    if (width < 1024) {
      await expect(page.locator("#player-bar")).not.toHaveClass(/open/);
      await video.click();
      await expect(page.locator("#player-bar")).toHaveClass(/open/);
      await expect(page.locator("#quality-btn")).toBeDisabled();
      await expect(page.locator("#btn-rec")).toBeHidden();
      await expect(page.locator("#btn-sleep")).toBeHidden();
    }
    await video.evaluate((el) => { const v = el as HTMLVideoElement; v.pause(); v.currentTime = 2; });
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeCloseTo(2, 1);
    for (const id of ["btn-live", "quality-btn", "btn-sleep"]) {
      await page.locator(`#${id}`).dispatchEvent("click");
    }
    await expect(page.locator("#quality-menu")).toBeHidden();
    await expect(page.locator("#sleep-menu")).toBeHidden();
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeCloseTo(2, 1);
    await page.locator("#btn-close-player").click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { revoked: string[] }).revoked.length)).toBeGreaterThanOrEqual(ext === "ts" ? 2 : 1);
    await page.locator(".recording-play").click();
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
    await page.locator("#btn-close-player").click();
    await nav("Каналы").click();
    await page.locator("#channel-list .channel-card").click();
    await expect(video).toHaveJSProperty("videoWidth", 160);
    if (width < 1024) await video.click();
    await page.locator("#video-stage").hover();
    await expect(page.locator("#btn-rec")).toBeVisible();
    await expect(page.locator("#btn-sleep")).toBeVisible();
    await expect(page.locator("#sleep-badge")).toBeHidden();
    await expect(page.locator("#quality-btn")).toBeEnabled();
    await expect(page.locator("#quality-btn")).toHaveAttribute("aria-disabled", "false");
    await expect.poll(() => video.evaluate((el) => { const v = el as HTMLVideoElement; return v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0; })).toBeGreaterThan(25);
    await video.evaluate((el) => { const v = el as HTMLVideoElement; v.pause(); v.currentTime = 2; });
    await expect(page.locator("#btn-live")).toBeVisible();
    await expect(page.locator("#btn-live")).toBeEnabled();
    await expect(page.locator("#btn-live")).toHaveAttribute("aria-disabled", "false");
    await page.locator("#btn-live").click();
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeGreaterThan(10);
    await page.locator("#quality-btn").click();
    await expect(page.locator("#quality-menu")).toBeVisible();
    await page.locator("#quality-btn").click();
    if (width >= 1024) {
      await page.locator("#btn-multi-view").click();
      await expect(page.locator("#multi-view")).toBeVisible();
      await nav("Записи").click();
      await page.locator(".recording-play").click();
      await expect(page.locator("#multi-view")).toBeHidden();
      await expect(video).toHaveJSProperty("videoWidth", 160);
      await expect(page.locator("#quality-btn")).toBeDisabled();
      await expect(page.locator("#btn-sleep")).toBeHidden();
    }
  });
}
