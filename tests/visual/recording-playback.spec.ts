import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const { kind, width } of [
  ...[390, 1440].flatMap((width) => ["ts", "mp4", "webm"].map((kind) => ({ kind, width }))),
  { kind: "invalid-ts", width: 1440 },
]) {
  test(kind === "invalid-ts" ? "нечитаемая TS-запись показывает ошибку" : `запись ${kind}, ${width}px: кадр, звук, управление и возврат к эфиру`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const hasEpg = kind === "ts" && width === 1440;
    const ext = kind === "invalid-ts" ? "ts" : kind;
    const bytes = kind === "invalid-ts" ? [0, 1, 2, 3] : [...readFileSync(`tests/fixtures/recording.${ext === "ts" ? "mpegts" : ext}`)];
    await page.goto("/");
    await page.evaluate(async ({ bytes, ext, hasEpg }) => {
      const id = "fixture";
      const dir = await navigator.storage.getDirectory();
      const file = await dir.getFileHandle(`done-${id}.${ext}`, { create: true });
      const sink = await file.createWritable();
      await sink.write(new Uint8Array(bytes));
      await sink.close();
      localStorage.setItem("iptv-hub.recordings.v1", JSON.stringify([{
        id, channelName: "Тест записи", channelUrl: "", programmeTitle: null,
        startedAt: 1000, durationSec: ext === "ts" ? 4 : 99, sizeBytes: bytes.length, ext,
      }]));
      localStorage.setItem("iptv-hub.view.v1", "recordings");
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{
        id: "test", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: hasEpg ? "https://fixture.test/epg.xml" : null,
      }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "test");
    }, { bytes, ext, hasEpg });
    await page.route("https://fixture.test/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("epg.xml")) {
        const date = (offset: number) => new Date(Date.now() + offset).toISOString().replace(/\D/g, "").slice(0, 14) + " +0000";
        return route.fulfill({ contentType: "application/xml", body: `<tv><channel id="test"><display-name>Канал</display-name></channel><programme channel="test" start="${date(-3_600_000)}" stop="${date(3_600_000)}"><title>Передача эфира</title></programme></tv>` });
      }
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
      if (hasEpg) {
        await expect(page.locator("#now-show")).toHaveText("Передача эфира");
        await expect(page.locator("#now-schedule")).not.toHaveJSProperty("hidden", true);
      }
      await nav("Записи").click();
      // Открытое меню и активный таймер эфира не должны остаться у файла.
      // Таймер сна ставится только во время записи эфира (#471).
      if (width < 1024) await page.locator("#player-bar").click();
      await page.locator("#btn-rec").dispatchEvent("click");
      await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
      await expect(page.locator("#btn-sleep")).toBeVisible();
      await page.locator("#btn-sleep").dispatchEvent("click");
      await expect(page.locator("#sleep-menu")).toBeVisible();
      await page.locator('[data-sleep="30"]').dispatchEvent("click");
      await expect(page.locator("#sleep-badge")).not.toHaveJSProperty("hidden", true);
      // Остановка записи с открытым меню закрывает и его (#471).
      await page.locator("#btn-sleep").dispatchEvent("click");
      await expect(page.locator("#sleep-menu")).toBeVisible();
      // Остановка записи прячет кнопку, меню и бейдж (#471). Свежую запись
      // выкидываем из библиотеки, чтобы дальше играл одиночный фикстурный файл.
      await page.locator("#btn-rec").dispatchEvent("click");
      await expect(page.locator("#btn-rec")).not.toHaveClass(/recording/);
      await expect(page.locator("#btn-sleep")).toBeHidden();
      await expect(page.locator("#sleep-menu")).toBeHidden();
      await expect(page.locator("#sleep-badge")).toBeHidden();
      await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem("iptv-hub.recordings.v1") ?? "[]") as unknown[]).length)).toBe(2);
      await page.evaluate(async () => {
        const dir = await navigator.storage.getDirectory();
        const key = "iptv-hub.recordings.v1";
        const recs = JSON.parse(localStorage.getItem(key) ?? "[]") as { id: string; ext: string }[];
        const fresh = recs.find((r) => r.id !== "fixture");
        if (fresh) await dir.removeEntry(`done-${fresh.id}.${fresh.ext}`).catch(() => undefined);
        localStorage.setItem(key, JSON.stringify(recs.filter((r) => r.id === "fixture")));
      });
      if (width < 1024) await page.locator("#btn-expand").click();
      await nav("Каналы").click();
      await nav("Записи").click();
      await expect(page.locator(".recording-play")).toHaveCount(1);
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
    for (const id of ["btn-prev", "btn-next"]) {
      await expect(page.locator(`#${id}`)).toBeHidden();
      await expect(page.locator(`#${id}`)).toBeDisabled();
    }
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
    await expect(page.locator("#prog-start")).toHaveText("00:02");
    await expect(page.locator("#prog-end")).toHaveText("00:04");
    await expect.poll(() => page.locator("#scrub-fill").evaluate((el) => parseFloat((el as HTMLElement).style.width))).toBeGreaterThan(45);
    await expect.poll(() => page.locator("#scrub-fill").evaluate((el) => parseFloat((el as HTMLElement).style.width))).toBeLessThan(55);
    expect(await page.locator("#mini-prog-fill").getAttribute("style")).toBe(await page.locator("#scrub-fill").getAttribute("style"));
    await expect(page.locator("#now-time-left")).toBeEmpty();
    await expect(page.locator("#now-show")).toBeEmpty();
    await expect(page.locator("#now-schedule")).toBeHidden();
    const scrub = page.locator("#scrub");
    await expect(scrub).toHaveAttribute("role", "slider");
    await expect(scrub).toHaveAttribute("aria-valuemin", "0");
    await expect(scrub).toHaveAttribute("aria-valuetext", "00:02 / 00:04");
    const track = (await scrub.boundingBox())!;
    const y = track.y + track.height / 2;
    const duration = await video.evaluate((el: HTMLVideoElement) => el.duration);
    await page.mouse.click(track.x + track.width / 4, y);
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(duration / 4, 1);
    await page.mouse.move(track.x + track.width / 4, y);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 3 / 4, y, { steps: 5 });
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(duration / 4, 1);
    await video.evaluate((el: HTMLVideoElement) => el.dispatchEvent(new Event("timeupdate")));
    await expect.poll(() => page.locator("#scrub-fill").evaluate((el: HTMLElement) => parseFloat(el.style.width))).toBeCloseTo(75, 0);
    await page.mouse.up();
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(duration * 3 / 4, 1);
    await expect(video).toHaveJSProperty("paused", true);
    await page.mouse.move(track.x + track.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width + 20, y);
    await page.mouse.up();
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(duration, 1);
    await scrub.press("Home");
    await expect(video).toHaveJSProperty("currentTime", 0);
    await scrub.press("End");
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(duration, 1);
    await scrub.press("ArrowLeft");
    await expect(video).toHaveJSProperty("currentTime", 0);
    await scrub.press("ArrowRight");
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(duration, 1);
    const recordingSource = await video.getAttribute("src");
    await page.locator("#btn-pause").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(video).toHaveJSProperty("currentTime", 0);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => Math.abs(el.currentTime - el.duration))).toBeLessThan(0.1);
    await expect(video).toHaveAttribute("src", recordingSource!);
    await expect(page.locator("#quality-btn")).toBeDisabled();
    await video.evaluate((el: HTMLVideoElement) => { el.currentTime = 2; });
    // Native files use their real duration; before metadata they use the saved estimate.
    await video.evaluate((el) => { Object.defineProperty(el, "duration", { value: NaN, configurable: true }); el.dispatchEvent(new Event("timeupdate")); });
    await expect(scrub).not.toHaveAttribute("role", "slider");
    await expect(page.locator("#prog-end")).toHaveText(ext === "ts" ? "00:04" : "01:39");
    await video.evaluate((el) => { Reflect.deleteProperty(el, "duration"); el.dispatchEvent(new Event("timeupdate")); });
    await expect(page.locator("#prog-end")).toHaveText("00:04");
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
    for (const id of ["btn-prev", "btn-next"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
      await expect(page.locator(`#${id}`)).toBeEnabled();
    }
    await expect(page.locator("#btn-sleep")).toBeHidden();
    await expect(page.locator("#sleep-badge")).toBeHidden();
    await expect(page.locator("#quality-btn")).toBeEnabled();
    await expect(page.locator("#quality-btn")).toHaveAttribute("aria-disabled", "false");
    await expect(scrub).not.toHaveAttribute("role", "slider");
    await expect(scrub).not.toHaveAttribute("tabindex", "0");
    if (hasEpg) {
      await expect(page.locator("#now-show")).toHaveText("Передача эфира");
      await expect(page.locator("#prog-start")).toHaveText(/\d{2}:\d{2}/);
      await expect(page.locator("#now-schedule")).toBeVisible();
    } else {
      await expect(page.locator("#prog-start")).toBeEmpty();
      await expect(page.locator("#prog-end")).toBeEmpty();
      await expect(page.locator("#mini-prog-fill")).toHaveAttribute("style", "width: 0%;");
    }
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
