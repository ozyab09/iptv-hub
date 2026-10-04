import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// #359: скачивание передачи из архива показывает прогресс и отменяется;
// отмена убирает скрытый плеер и рабочий файл, новое скачивание доступно сразу.
test("programme download shows progress, cancels cleanly and restarts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const now = Date.now();
  const date = (ms: number) => new Date(ms).toISOString().replace(/\D/g, "").slice(0, 14) + " +0000";
  const ts = readFileSync("tests/fixtures/recording.mpegts");
  await page.route("https://fixture.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith(".xml")) {
      return route.fulfill({ contentType: "application/xml", body: `<tv><channel id="a"><display-name>Alpha</display-name></channel><programme channel="a" start="${date(now - 7_200_000)}" stop="${date(now - 3_600_000)}"><title>Past show</title></programme><programme channel="a" start="${date(now - 3_600_000)}" stop="${date(now + 3_600_000)}"><title>Current show</title></programme></tv>` });
    }
    if (url.includes(".m3u8")) {
      const entries = Array.from({ length: 30 }, (_, i) => `#EXT-X-DISCONTINUITY\n#EXTINF:4,\n${i}.ts`).join("\n");
      return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-TARGETDURATION:4\n${entries}\n#EXT-X-ENDLIST\n` });
    }
    if (url.endsWith(".ts")) return route.fulfill({ contentType: "video/mp2t", body: ts });
    return route.fulfill({ body: `#EXTM3U\n#EXTINF:-1 tvg-id="a" catchup-days="3" catchup-source="https://fixture.test/archive.m3u8?utc={utc}",Alpha\nhttps://fixture.test/live.m3u8\n` });
  });
  await page.addInitScript(() => {
    localStorage.setItem("iptv-hub.language.v1", "en");
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "dl", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "dl");
  });
  await page.goto("/");
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#now-show")).toHaveText("Current show");

  const download = page.locator("#now-schedule .programme-download").first();
  await expect(download).toHaveText("Download programme");
  await download.click();
  await expect(download).toHaveText(/Cancel · \d+%/);
  await expect(page.locator(".programme-download-video")).toHaveCount(1);
  await expect.poll(() => page.evaluate(async () => {
    const names: string[] = [];
    const dir = await navigator.storage.getDirectory() as unknown as { keys(): AsyncIterable<string> };
    for await (const name of dir.keys()) names.push(name);
    return names.filter((n) => n.startsWith("download-rec-") && n.endsWith(".part")).length;
  })).toBe(1);

  await page.locator("#side-nav button").filter({ hasText: "Recordings" }).click();
  const status = page.locator("#download-status");
  await expect(status).toBeVisible();
  await expect(status).toContainText("Past show");
  await expect(status.locator("progress")).toBeVisible();
  await status.getByRole("button", { name: "Cancel download" }).click();
  await expect(page.locator("#toast")).toHaveText("Download cancelled");
  await expect(status).toBeHidden();
  await expect(page.locator(".programme-download-video")).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const names: string[] = [];
    const dir = await navigator.storage.getDirectory() as unknown as { keys(): AsyncIterable<string> };
    for await (const name of dir.keys()) names.push(name);
    return names.filter((n) => n.startsWith("download-rec-") && n.endsWith(".part")).length;
  })).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.recordings.v1"))).toBeNull();

  await page.locator("#side-nav button").filter({ hasText: "Channels" }).click();
  await expect(download).toHaveText("Download programme");
  await download.click();
  await expect(download).toHaveText(/Cancel · \d+%/);
  await download.click();
  await expect(download).toHaveText("Download programme");
  await expect(page.locator(".programme-download-video")).toHaveCount(0);
});
