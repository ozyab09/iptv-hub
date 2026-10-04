import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const kind of ["mp4", "ts"]) {
  test(`local subtitles on ${kind}: cues, seek, toggle, privacy and deletion`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("https://fixture.test/list.m3u", (route) => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,Live\nhttps://fixture.test/live.mp4\n" }));
    await page.route("https://fixture.test/live.mp4", (route) => route.fulfill({ body: readFileSync("tests/fixtures/recording.mp4"), contentType: "video/mp4" }));
    await page.goto("/");
    await page.evaluate(async ({ bytes, kind }) => {
      const dir = await navigator.storage.getDirectory();
      const handle = await dir.getFileHandle(`done-test.${kind}`, { create: true });
      const writer = await handle.createWritable();
      await writer.write(new Uint8Array(bytes));
      await writer.close();
      localStorage.setItem("iptv-hub.language.v1", "en");
      localStorage.setItem("iptv-hub.recordings.v1", JSON.stringify([{ id: "test", channelName: "Recording", channelUrl: "", programmeTitle: null, startedAt: 1000, durationSec: 4, sizeBytes: bytes.length, ext: kind }]));
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "one", name: "one", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "one");
      localStorage.setItem("iptv-hub.view.v1", "recordings");
    }, { kind, bytes: [...readFileSync(`tests/fixtures/recording.${kind === "ts" ? "mpegts" : kind}`)] });
    await page.reload();
    const chooser = page.waitForEvent("filechooser");
    await page.locator("[data-recording-subtitles]").click();
    await (await chooser).setFiles({ name: "local.srt", mimeType: "text/plain", buffer: Buffer.from("\uFEFF1\r\n00:00:00,100 --> 00:00:01,800\r\n<b>PrivateCue</b>\r\nSecond line\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,800\r\nAfter seek\r\n") });
    const video = page.locator("#video");
    await expect(video).toHaveJSProperty("videoWidth", 160);
    await video.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 1; });
    const activeText = () => video.evaluate((element: HTMLVideoElement) => {
      const track = Array.from(element.textTracks).find((track) => track.label === "External");
      return Array.from(track?.activeCues ?? []).map((cue) => (cue as VTTCue).getCueAsHTML().textContent).join("\n");
    });
    await expect.poll(activeText).toBe("<b>PrivateCue</b>\nSecond line");
    await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 3; });
    await expect.poll(activeText).toBe("After seek");
    await page.locator("#subtitle-btn").click();
    await page.locator("#subtitle-menu").getByRole("option", { name: "Off", exact: true }).click();
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => Array.from(element.textTracks).find((track) => track.label === "External")?.mode)).toBe("disabled");
    await page.locator("#subtitle-btn").click();
    await page.locator("#subtitle-menu").getByRole("option", { name: "local.srt", exact: true }).click();
    await expect.poll(activeText).toBe("After seek");
    expect(await page.evaluate(() => Object.values(localStorage).join("\n"))).not.toContain("PrivateCue");
    expect(requests.some((url) => /local\.srt|PrivateCue/.test(url))).toBe(false);
    await page.locator("#subtitle-btn").click();
    const vttChooser = page.waitForEvent("filechooser");
    await page.locator("#subtitle-menu").getByRole("option", { name: "Subtitles from file", exact: true }).click();
    await (await vttChooser).setFiles({ name: "replacement.vtt", mimeType: "text/vtt", buffer: Buffer.from("WEBVTT\n\n00:00.000 --> 00:04.000\nReplacement\n") });
    await expect.poll(activeText).toBe("Replacement");
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => Array.from(element.textTracks).find((track) => track.label === "External")?.cues?.length)).toBe(1);
    await page.locator("#side-nav button").filter({ hasText: "Channels", visible: true }).click();
    await page.locator("#channel-list .channel-card").click();
    await expect(video).toHaveJSProperty("videoWidth", 160);
    expect(await video.evaluate((element: HTMLVideoElement) => Array.from(element.textTracks).find((track) => track.label === "External")?.mode)).toBe("disabled");
    await page.locator("#subtitle-btn").click();
    const vodChooser = page.waitForEvent("filechooser");
    await page.locator("#subtitle-menu").getByRole("option", { name: "Subtitles from file", exact: true }).click();
    await (await vodChooser).setFiles({ name: "vod.vtt", mimeType: "text/vtt", buffer: Buffer.from("WEBVTT\n\n00:00.000 --> 00:04.000\nVOD subtitles\n") });
    await video.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 1; });
    await expect.poll(activeText).toBe("VOD subtitles");
    await page.evaluate(() => {
      const read = File.prototype.text;
      File.prototype.text = function () {
        const file = this;
        return new Promise<string>((resolve) => {
          (window as unknown as { releaseSubtitleFile(): Promise<void> }).releaseSubtitleFile = () => read.call(file).then(resolve);
        });
      };
    });
    await page.locator("#subtitle-btn").click();
    const lateChooser = page.waitForEvent("filechooser");
    await page.locator("#subtitle-menu").getByRole("option", { name: "Subtitles from file", exact: true }).click();
    await (await lateChooser).setFiles({ name: "late.vtt", mimeType: "text/vtt", buffer: Buffer.from("WEBVTT\n\n00:00.000 --> 00:04.000\nLate subtitles\n") });
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseSubtitleFile?: () => void }).releaseSubtitleFile)).toBe("function");
    await page.locator("#btn-close-player").click();
    await page.evaluate(() => (window as unknown as { releaseSubtitleFile(): Promise<void> }).releaseSubtitleFile());
    await expect(video).not.toHaveAttribute("src");
    expect(await video.evaluate((element: HTMLVideoElement) => Array.from(element.textTracks).some((track) => track.mode === "showing"))).toBe(false);
    await page.locator("#side-nav button").filter({ hasText: "Recordings", visible: true }).click();
    await page.reload();
    await expect(page.locator("[data-recording-subtitles]")).toHaveAttribute("title", /replacement\.vtt/);
    await page.locator(".recording-play").click();
    await expect(video).toHaveJSProperty("videoWidth", 160);
    expect(await video.evaluate((element: HTMLVideoElement) => Array.from(element.textTracks).some((track) => track.mode === "showing"))).toBe(false);
    await page.locator(".recording-actions button[aria-label='Delete recording']").click();
    await expect(page.locator(".recording-card")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("iptv-hub.recording-subtitles.v1:test"))).toBeNull();
  });
}
