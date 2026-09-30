import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const kind of ["ts", "mp4", "invalid-ts"]) {
  test(kind === "invalid-ts" ? "нечитаемая TS-запись показывает ошибку" : `запись ${kind}: кадр, звук, перемотка и повторное открытие`, async ({ page }) => {
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
    await page.route("https://fixture.test/**", (route) => route.fulfill({ body: "#EXTM3U\n" }));
    await page.reload();
    // Проверяем освобождение локальных URL при закрытии записи.
    await page.evaluate(() => {
      const revoke = URL.revokeObjectURL.bind(URL);
      (window as unknown as { revoked: string[] }).revoked = [];
      URL.revokeObjectURL = (url) => { (window as unknown as { revoked: string[] }).revoked.push(url); revoke(url); };
    });
    await page.locator(".recording-card").click();
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
    await video.evaluate((el) => { const v = el as HTMLVideoElement; v.pause(); v.currentTime = 2; });
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeCloseTo(2, 1);
    await page.locator("#btn-close-player").click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { revoked: string[] }).revoked.length)).toBeGreaterThanOrEqual(ext === "ts" ? 2 : 1);
    await page.locator(".recording-card").click();
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
  });
}
