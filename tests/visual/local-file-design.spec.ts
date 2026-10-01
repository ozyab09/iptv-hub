import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"]) {
    for (const existing of [false, true]) {
      test(`local file control and keyboard import (${width}, ${theme}, ${existing ? "settings" : "first run"})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.route("https://fixture.test/playlist.m3u", (route) => route.fulfill({ body: "#EXTINF:-1,Remote\nhttps://fixture.test/remote.mp4\n" }));
        await page.addInitScript(({ theme, existing }) => {
          localStorage.setItem("iptv-hub.theme.v1", theme);
          localStorage.setItem("iptv-hub.language.v1", "en");
          if (existing && !localStorage.getItem("iptv-hub.playlists.v1")) {
            localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "remote", name: "Remote", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }]));
            localStorage.setItem("iptv-hub.active-playlist.v1", "remote");
          }
        }, { theme, existing });
        await page.goto("/");
        if (existing) {
          await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
          await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
          await page.locator("#btn-add-pl").click();
        }
        const button = page.locator("#btn-local-file");
        await expect(button).toBeVisible();
        await button.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/local-file-${width}-${theme}-${existing}.png` });
        const appearance = await button.evaluate((el) => {
          const style = getComputedStyle(el);
          const body = getComputedStyle(document.body);
          const submit = getComputedStyle(document.querySelector("#setup-load")!);
          const field = document.querySelector("#setup-playlist")!.closest(".input")!;
          return { font: style.fontFamily, bodyFont: body.fontFamily, color: style.color, bodyColor: body.color, borderStyle: style.borderTopStyle,
            radius: style.borderRadius, submitRadius: submit.borderRadius, height: el.getBoundingClientRect().height,
            width: el.getBoundingClientRect().width, fieldWidth: field.getBoundingClientRect().width };
        });
        expect(appearance.font).toBe(appearance.bodyFont);
        expect(appearance.color).toBe(appearance.bodyColor);
        expect(appearance.radius).toBe(appearance.submitRadius);
        expect(appearance.borderStyle).toBe("solid");
        expect(appearance.height).toBe(44);
        expect(appearance.width).toBeCloseTo(appearance.fieldWidth, 0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.locator("#setup-playlist").focus();
        await page.keyboard.press("Tab");
        await expect(button).toBeFocused();
        const focus = await button.evaluate((el) => ({ visible: el.matches(":focus-visible"), width: getComputedStyle(el).outlineWidth }));
        expect(focus.visible).toBe(true);
        expect(focus.width).toBe("2px");
        const chooserPromise = page.waitForEvent("filechooser");
        await button.press("Enter");
        const chooser = await chooserPromise;
        await chooser.setFiles({ name: "Local.m3u8", mimeType: "application/x-mpegurl", buffer: Buffer.from("#EXTM3U\n#EXTINF:-1,Local One\nhttps://fixture.test/one.mp4\n#EXTINF:-1,Local Two\nhttps://fixture.test/two.mp4\n") });
        await expect(page.locator("#pl-switch-name")).toHaveText("Local");
        expect(await page.evaluate(async () => {
          const state = JSON.parse(localStorage.getItem("iptv-hub.playlists.v1")!);
          const local = state.find((pl: { name: string }) => pl.name === "Local");
          const dir = await navigator.storage.getDirectory();
          const handle = await dir.getFileHandle(`local:${local.id}`);
          return (await (await handle.getFile()).text()).includes("Local One");
        })).toBe(true);
      });
    }
  }
}
