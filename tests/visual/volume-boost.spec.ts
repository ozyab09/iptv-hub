import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("iptv-hub.playlists.v1")) {
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "test", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "test");
      localStorage.setItem("iptv-hub.player-settings.v1", JSON.stringify({ volumeBoost: true }));
    }
    const state = { gains: [] as GainNode[], analysers: [] as AnalyserNode[], tracks: [] as MediaStreamTrack[] };
    (window as unknown as { audioTest: typeof state }).audioTest = state;
    const create = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = create.call(this);
      const analyser = this.createAnalyser();
      node.connect(analyser);
      state.gains.push(node);
      state.analysers.push(analyser);
      return node;
    };
    const proto = HTMLVideoElement.prototype as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    const key = proto.captureStream ? "captureStream" : "mozCaptureStream";
    const capture = proto[key]!;
    proto[key] = function () {
      const stream = capture.call(this);
      state.tracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("playlist.m3u")) return route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,HLS\nhttps://fixture.test/live.m3u8\n#EXTINF:-1,Native\nhttps://fixture.test/video.mp4\n" });
    if (url.endsWith(".mp4")) return route.fulfill({ contentType: "video/mp4", body: readFileSync("tests/fixtures/recording.mp4") });
    if (url.endsWith(".ts")) return route.fulfill({ contentType: "video/mp2t", body: readFileSync("tests/fixtures/recording.mpegts") });
    const entries = Array.from({ length: 20 }, (_, i) => `#EXT-X-DISCONTINUITY\n#EXTINF:4,\n${i}.ts`).join("\n");
    return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-TARGETDURATION:4\n${entries}\n#EXT-X-ENDLIST\n` });
  });
  await page.goto("/");
});

test("HLS volume boost: real audio, mute, persistence and native restoration", async ({ page }) => {
  const channel = (name: string) => page.locator("#channel-list .channel-card").filter({ hasText: name });
  await channel("HLS").click();
  const video = page.locator("#video");
  const slider = page.locator("#volume-slider");
  await expect(video).toHaveJSProperty("videoWidth", 160);
  await expect(slider).toHaveAttribute("max", "200");
  const setVolume = async (value: number) => slider.evaluate((el, value) => {
    (el as HTMLInputElement).value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await setVolume(150);
  const gain = () => page.evaluate(() => (window as unknown as { audioTest: { gains: GainNode[] } }).audioTest.gains.at(-1)?.gain.value);
  const rms = () => page.evaluate(() => {
    const analyser = (window as unknown as { audioTest: { analysers: AnalyserNode[] } }).audioTest.analysers.at(-1);
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
  });
  await expect.poll(gain).toBe(1.5);
  await expect.poll(rms).toBeGreaterThan(0.01);
  await expect(slider).toHaveClass(/volume-boosting/);
  await expect(video).toHaveJSProperty("volume", 0);
  const source = await video.getAttribute("src");
  await setVolume(200);
  await expect.poll(gain).toBe(2);
  await page.locator("#btn-mute").dispatchEvent("click");
  await expect.poll(gain).toBe(0);
  await expect.poll(rms).toBeLessThan(0.001);
  await page.locator("#player-settings-form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await expect.poll(gain).toBe(0);
  await expect(video).toHaveJSProperty("muted", true);
  await page.locator("#btn-mute").dispatchEvent("click");
  await expect.poll(gain).toBe(2);
  await expect.poll(rms).toBeGreaterThan(0.01);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.player-settings.v1")!).volumePercent)).toBe(200);
  await expect(video).toHaveAttribute("src", source!);
  const nav = (name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first();
  await nav("Настройки").click();
  await page.locator("#player-volume-boost").uncheck();
  await page.locator('#player-settings-form button[type="submit"]').click();
  await expect(slider).toHaveAttribute("max", "100");
  await expect(video).toHaveJSProperty("volume", 1);
  await expect(video).toHaveAttribute("src", source!);
  expect(await page.evaluate(() => (window as unknown as { audioTest: { tracks: MediaStreamTrack[] } }).audioTest.tracks.every((track) => track.readyState === "ended"))).toBe(true);
  await page.locator("#player-volume-boost").check();
  await page.locator('#player-settings-form button[type="submit"]').click();
  await setVolume(150);
  await page.reload();
  await channel("HLS").click();
  await expect.poll(gain).toBe(1.5);
  await expect.poll(rms).toBeGreaterThan(0.01);
  await channel("Native").click();
  await expect(video).toHaveJSProperty("videoWidth", 160);
  await expect(video).toHaveJSProperty("volume", 1);
  await expect(slider).toHaveAttribute("max", "100");
});

test("unavailable audio capture warns and restores 100% without restarting HLS", async ({ page }) => {
  await page.locator("#channel-list .channel-card").filter({ hasText: "HLS" }).click();
  const video = page.locator("#video");
  await expect(video).toHaveJSProperty("videoWidth", 160);
  const source = await video.getAttribute("src");
  await video.evaluate((el) => {
    Object.assign(el, { captureStream: () => { throw new DOMException("Blocked capture", "SecurityError"); } });
  });
  await page.locator("#volume-slider").evaluate((el) => {
    (el as HTMLInputElement).value = "150";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#toast")).toContainText("Усиление недоступно");
  await expect(video).toHaveJSProperty("volume", 1);
  await expect(page.locator("#volume-slider")).toHaveValue("100");
  await expect(video).toHaveAttribute("src", source!);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.player-settings.v1")!).volumePercent)).toBe(100);
});

test("canvas recording keeps real audio through the shared graph", async ({ page }) => {
  await page.route("https://fixture.test/playlist.m3u", (route) => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Native\nhttp://localhost:4173/record-source.mp4\n" }));
  await page.route("**/record-source.mp4", (route) => route.fulfill({ contentType: "video/mp4", body: readFileSync("tests/fixtures/recording.mp4") }));
  await page.reload();
  await page.evaluate(() => {
    const state = (window as unknown as { audioTest: { analysers: AnalyserNode[] } }).audioTest;
    const create = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (video) {
      const source = create.call(this, video);
      const analyser = this.createAnalyser();
      source.connect(analyser);
      state.analysers.push(analyser);
      return source;
    };
    Object.assign(document.querySelector("#video")!, { loop: true, captureStream: () => { throw new Error("Use canvas recording"); } });
  });
  await page.locator("#channel-list .channel-card").click();
  const video = page.locator("#video");
  await expect(video).toHaveJSProperty("videoWidth", 160);
  await page.locator("#btn-rec").dispatchEvent("click");
  await expect(page.locator("#btn-rec")).toHaveClass(/recording/);
  const rms = () => page.evaluate(() => {
    const analyser = (window as unknown as { audioTest: { analysers: AnalyserNode[] } }).audioTest.analysers.at(-1);
    if (!analyser) return 0;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length);
  });
  await expect.poll(rms).toBeGreaterThan(0.01);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(1.5);
  await page.locator("#btn-rec").dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1") ?? "[]").length)).toBe(1);
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Записи", visible: true }).first().click();
  await page.locator(".recording-play").click();
  await expect(video).toHaveJSProperty("videoWidth", 160);
  await expect.poll(rms).toBeGreaterThan(0.01);
});
