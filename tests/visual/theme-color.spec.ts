import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const metas = (page: import("@playwright/test").Page) =>
  page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((el) => (el as HTMLMetaElement).content));

// #360: theme-color браузера/PWA следует за темой приложения без перезагрузки.
for (const scheme of ["dark", "light"] as const) {
  test(`theme-color follows the app theme (system ${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.route("https://fixture.test/**", (route) => route.fulfill({ body: "#EXTM3U\n#EXTINF:-1,A\nhttps://fixture.test/a.mp4\n" }));
    await page.addInitScript(() => {
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "t", name: "TV", playlistUrl: "https://fixture.test/p.m3u", epgUrl: null }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "t");
    });
    await page.goto("/");
    const system = scheme === "dark" ? "#0c0d10" : "#f6f6f8";
    await expect.poll(() => metas(page)).toEqual([system, system]);

    await page.locator("#btn-theme").click();
    const other = scheme === "dark" ? "#f6f6f8" : "#0c0d10";
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme === "dark" ? "light" : "dark");
    await expect.poll(() => metas(page)).toEqual([other, other]);
  });
}
