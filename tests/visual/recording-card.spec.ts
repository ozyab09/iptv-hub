import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [320, 390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`recording actions: ${width}px, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const bytes = [...readFileSync("tests/fixtures/recording.mp4")];
      await page.goto("/");
      await page.evaluate(async ({ bytes, theme }) => {
        const dir = await navigator.storage.getDirectory();
        for (const id of ["first", "second"]) {
          const file = await dir.getFileHandle(`done-${id}.mp4`, { create: true });
          const sink = await file.createWritable();
          await sink.write(new Uint8Array(bytes));
          await sink.close();
        }
        localStorage.setItem("iptv-hub.recordings.v1", JSON.stringify(["first", "second"].map((id) => ({
          id, channelName: "Канал с длинным названием", channelUrl: "", programmeTitle: "Очень длинное название записанной передачи",
          startedAt: 1000, durationSec: 4, sizeBytes: bytes.length, ext: "mp4",
        }))));
        localStorage.setItem("iptv-hub.theme.v1", theme);
        localStorage.setItem("iptv-hub.view.v1", "recordings");
        localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{
          id: "test", name: "Тест", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null,
        }]));
        localStorage.setItem("iptv-hub.active-playlist.v1", "test");
      }, { bytes, theme });
      await page.route("https://fixture.test/**", (route) => route.fulfill({ body: "#EXTM3U\n" }));
      await page.reload();
      const cards = page.locator(".recording-card");
      await expect(cards).toHaveCount(2);
      await expect(cards.first()).toHaveJSProperty("tagName", "DIV");
      await expect(page.locator(".recording-card button button")).toHaveCount(0);
      const card = cards.first();
      const name = await card.locator(".recording-name").boundingBox();
      const bounds = await card.boundingBox();
      const actions = card.locator(".recording-act");
      let previousRight = name!.x + name!.width;
      for (const action of await actions.all()) {
        const box = (await action.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(previousRight);
        expect(box.x + box.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
        previousRight = box.x + box.width;
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: test.info().outputPath("recording-card.png") });
      await card.locator(".recording-play").focus();
      await page.keyboard.press("Tab");
      await expect(actions.nth(0)).toBeFocused();
      await expect(actions.nth(0)).toHaveCSS("outline-style", "solid");
      const downloadPromise = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.mp4$/);
      expect([...readFileSync((await download.path())!)]).toEqual(bytes);
      await expect(page.locator("#player-bar")).toBeHidden();
      await page.keyboard.press("Tab");
      await expect(actions.nth(1)).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(cards).toHaveCount(1);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.recordings.v1")!).length)).toBe(1);
      expect(await page.evaluate(async () => {
        const dir = await navigator.storage.getDirectory();
        const recordings = JSON.parse(localStorage.getItem("iptv-hub.recordings.v1")!) as { id: string }[];
        const deletedId = recordings[0]!.id === "first" ? "second" : "first";
        try { await dir.getFileHandle(`done-${deletedId}.mp4`); return false; }
        catch (error) { return error instanceof DOMException && error.name === "NotFoundError"; }
      })).toBe(true);
      await expect(page.locator("#player-bar")).toBeHidden();
      await cards.first().locator(".recording-play").focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => page.locator("#video").evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(160);
    });
  }
}
