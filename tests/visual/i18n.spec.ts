import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", locale: "en-US" });

for (const width of [390, 1440]) {
  test(`локализация без перезагрузки и без перевода данных (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const xmlDate = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
    const now = Date.now();
    await page.route("https://fixture.test/**", (route) => route.fulfill({ body: route.request().url().endsWith("epg.xml")
      ? `<tv><channel id="test"><display-name>Сохранить</display-name></channel><programme channel="test" start="${xmlDate(now - 600000)}" stop="${xmlDate(now + 3600000)}"><title>Плеер</title></programme></tv>`
      : '#EXTM3U\n#EXTINF:-1 tvg-id="test",Сохранить\nhttps://fixture.test/stream.m3u8\n' }));
    await page.addInitScript(() => {
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "test", name: "Настройки", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: "https://fixture.test/epg.xml" }]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "test");
      localStorage.setItem("iptv-hub.notifications.v1", JSON.stringify([{ id: 1, text: "Плейлист проверён: без изменений. Каналов: 1, передач нет", at: 1000, read: false }]));
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#channel-list .channel-card .t-strong")).toHaveText("Сохранить");
    await expect(page.locator("#channel-list .channel-card")).toContainText("Плеер");
    await expect(page.locator("#pl-switch-name")).toHaveText("Настройки");
    await page.locator("#side-nav button, #tabbar button").filter({ hasText: "Settings", visible: true }).first().click();
    await expect(page.locator(".settings-title")).toHaveText("Settings");
    await page.locator("#btn-add-pl").click();
    await page.locator("#add-form summary").click();
    await page.locator("#setup-name").fill("Мой плейлист");
    await page.locator("#setup-load").click();
    await expect(page.locator("#setup-error")).toHaveText("Enter an http(s) playlist URL");
    await page.locator('[data-language="ru"]').click();
    await expect(page.locator(".settings-title")).toHaveText("Настройки");
    await expect(page.locator("#setup-error")).toHaveText("Нужен http(s)-URL плейлиста");
    await expect(page.locator("#setup-name")).toHaveValue("Мой плейлист");
    await page.locator(".pl-row .pl-act").first().click();
    await page.locator(".pl-edit input").first().fill("Незавершённый ввод");
    await page.locator('[data-language="en"]').click();
    await expect(page.locator(".pl-edit input").first()).toHaveValue("Незавершённый ввод");
    await expect(page.locator(".pl-edit button[type=submit]")).toHaveText("Save");
    await page.locator("#notif-bell").click();
    await expect(page.locator("#notif-list")).toContainText("Playlist checked: no changes. Channels: 1, no programmes");
    await page.locator("#notif-clear").click();
    await expect(page.locator("#notif-list")).toHaveText("Nothing has happened yet");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#pl-switch-name")).toHaveText("Настройки");
    expect(await page.evaluate(() => localStorage.getItem("iptv-hub.language.v1"))).toBe("en");
  });
}

test("сохранённый язык приоритетен языку браузера", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iptv-hub.language.v1", "ru"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator("#setup-load")).toHaveText("Открыть каналы");
  await page.locator('[data-language="en"]').click();
  await expect(page.locator("#setup-load")).toHaveText("Open channels");
});
