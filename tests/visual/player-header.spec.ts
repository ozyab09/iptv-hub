import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [320, 390, 1024, 1440]) {
  for (const theme of ["light", "dark"]) {
    for (const epg of [false, true]) {
      test(`строки шапки выровнены (${width}px, ${theme}, EPG=${epg})`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const segment = readFileSync("tests/fixtures/recording.mpegts");
        const programmeTitle = "Что? Где? Когда? ".repeat(8).trim();
        const xmlDate = (offset: number) => new Date(Date.now() + offset).toISOString().replace(/\D/g, "").slice(0, 14) + " +0000";
        await page.addInitScript(({ theme, epg }) => {
          localStorage.setItem("iptv-hub.theme.v1", theme);
          localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{
            id: "header", name: "TV", playlistUrl: "https://fixture.test/list.m3u",
            epgUrl: epg ? "https://fixture.test/epg.xml" : null,
          }]));
          localStorage.setItem("iptv-hub.active-playlist.v1", "header");
        }, { theme, epg });
        await page.route("https://fixture.test/**", (route) => {
          const url = route.request().url();
          if (url.endsWith("list.m3u")) return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="channel" group-title="Новости",Канал\nhttps://fixture.test/live.m3u8\n' });
          if (url.endsWith("epg.xml")) return route.fulfill({ contentType: "application/xml", body: `<tv><channel id="channel"><display-name>Канал</display-name></channel><programme channel="channel" start="${xmlDate(-3_600_000)}" stop="${xmlDate(3_600_000)}"><title>${programmeTitle}</title></programme></tv>` });
          if (url.endsWith(".ts")) return route.fulfill({ contentType: "video/mp2t", body: segment });
          return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\n0.ts\n#EXT-X-ENDLIST\n" });
        });
        await page.goto("/");
        await page.locator("#channel-list .channel-card").click();
        await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
        if (width < 1024) await page.locator("#video").click();
        const stage = page.locator("#video-stage");
        await stage.hover();
        await expect(page.locator("#btn-full-guide")).toBeVisible();
        const show = page.locator("#now-show");
        if (epg) await expect(show).toHaveText(programmeTitle);
        else await expect(show).toBeHidden();
        const frame = (await stage.boundingBox())!;
        const title = page.locator("#now-title");
        const initialY = (await title.boundingBox())!.y;

        for (const long of [false, true]) {
          await page.evaluate((long) => {
            document.getElementById("now-title")!.textContent = long ? "Очень длинное название телевизионного канала ".repeat(4) : "Канал";
            document.getElementById("now-category")!.textContent = long ? "Большая категория каналов ".repeat(4) : "Новости";
            document.getElementById("player-status")!.textContent = long ? "1920×1080 · высокая скорость потока ".repeat(4) : "160×90 · 1 Мбит/с";
          }, long);
          const channel = (await title.boundingBox())!;
          expect(channel.y).toBeCloseTo(initialY, 1);
          const status = page.locator("#player-status");
          if (await status.isVisible()) {
            const bounds = (await status.boundingBox())!;
            expect(Math.abs(channel.y + channel.height / 2 - bounds.y - bounds.height / 2)).toBeLessThanOrEqual(1);
          }
          if (epg) {
            const programme = (await show.boundingBox())!;
            expect(programme.x).toBeCloseTo(channel.x, 1);
            expect(programme.y).toBeGreaterThanOrEqual(channel.y + channel.height);
            const transport = (await page.locator(".transport").boundingBox())!;
            expect(programme.y + programme.height).toBeLessThanOrEqual(transport.y);
          }
          for (const label of [title, page.locator("#now-category"), show]) {
            await expect(label).toHaveCSS("text-overflow", "ellipsis");
          }
          const top = (await page.locator(".video .top").boundingBox())!;
          expect(top.x).toBeGreaterThanOrEqual(frame.x);
          expect(top.x + top.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await stage.screenshot({ path: testInfo.outputPath(`header-${long ? "long" : "short"}.png`) });
        }
      });
    }
  }
}
