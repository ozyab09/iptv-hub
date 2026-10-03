import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pbkdf2Sync } from "node:crypto";

test.use({ serviceWorkers: "block", timezoneId: "UTC" });
const now = Date.parse("2026-10-03T12:00:00Z");
const start = now + 600_000;
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
const nav = (page: Page, name: string) => page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first();
const stored = (page: Page, id = "one") => page.evaluate((id) => JSON.parse(localStorage.getItem(`iptv-hub.reminders.v1:${id}`) ?? "[]"), id);
const messages = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.notifications.v1") ?? "[]"));

async function setup(page: Page, width = 1440, permission = "granted") {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install({ time: now });
  const hash = pbkdf2Sync("0123", Buffer.alloc(16), 100_000, 32, "sha256").toString("hex");
  await page.context().route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.includes(".mp4")) return route.fulfill({ contentType: "video/mp4", body: readFileSync("tests/fixtures/recording.mp4") });
    if (url.endsWith(".xml")) return route.fulfill({ contentType: "application/xml", body: `<tv>${["a", "b"].map((id) => `<channel id="${id}"><display-name>${id === "a" ? "Alpha" : "Beta"}</display-name></channel><programme channel="${id}" start="${stamp(now - 600_000)}" stop="${stamp(start)}"><title>Current ${id}</title></programme><programme channel="${id}" start="${stamp(start)}" stop="${stamp(start + 3_600_000)}"><title>Future ${id}</title></programme>`).join("")}</tv>` });
    return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="Locked",Alpha\nhttps://fixture.test/a.mp4\n#EXTINF:-1 tvg-id="b" group-title="Open",Beta\nhttps://fixture.test/b.mp4\n' });
  });
  await page.addInitScript(({ hash, permission }) => {
    const state = window as unknown as { permissionRequests: number; systemReminders: unknown[] };
    state.permissionRequests = 0; state.systemReminders = [];
    class FakeNotification {
      static permission = "default";
      static async requestPermission() { state.permissionRequests++; this.permission = permission; return permission; }
      onclick: (() => void) | null = null;
      constructor(public title: string, public options: unknown) { state.systemReminders.push(this); }
      close() {}
    }
    Object.defineProperty(window, "Notification", { configurable: true, value: FakeNotification });
    if (localStorage.getItem("iptv-hub.playlists.v1")) return;
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify(["one", "two"].map((id) => ({ id, name: id, playlistUrl: `https://fixture.test/${id}.m3u`, epgUrl: "https://fixture.test/epg.xml" }))));
    localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    localStorage.setItem("iptv-hub.parental-pins.v1:one", JSON.stringify([{ group: "Locked", salt: "0".repeat(32), hash }]));
  }, { hash, permission });
  await page.goto("/");
  await expect(page.locator("#epg-now")).toBeHidden();
  await page.locator('#channel-list [data-channel-url="https://fixture.test/b.mp4"]').click();
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  await expect(page.locator("#now-show")).toHaveText("Current b");
}

async function future(page: Page, id = "b") {
  await page.locator("#search").fill(`Future ${id}`);
  const row = page.locator("#channel-list .channel-card");
  await expect(row).toHaveCount(1);
  return row.locator(".programme-reminder");
}

for (const width of [390, 1440]) {
  test(`guide/search toggle persists and fires once at five minutes (${width})`, async ({ page }) => {
    await setup(page, width);
    await page.keyboard.press("g");
    const button = page.locator("#guide-list .programme-reminder");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    expect((await stored(page))[0].leadMinutes).toBe(5);
    await page.keyboard.press("Escape");
    const searchButton = await future(page);
    await expect(searchButton).toHaveAttribute("aria-pressed", "true");
    await searchButton.click();
    expect(await stored(page)).toHaveLength(0);
    await searchButton.click();
    await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/b.mp4");
    await page.reload();
    await expect(page.locator("#epg-now")).toBeHidden();
    const reloaded = await future(page);
    await expect(reloaded).toHaveAttribute("aria-pressed", "true");
    await page.clock.fastForward(240_000);
    expect(await messages(page)).toHaveLength(0);
    await page.clock.fastForward(60_000);
    await expect.poll(() => messages(page)).toHaveLength(1);
    expect((await messages(page))[0].text).toContain("Future b");
    await page.clock.fastForward(60_000);
    expect(await messages(page)).toHaveLength(1);
    await page.locator("#notif-bell").click();
    await page.locator(".notification-watch").click();
    await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/b.mp4");
    await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
    await page.clock.fastForward(240_000);
    await expect.poll(() => stored(page)).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("keyboard reminder controls do not pause or start playback", async ({ page }) => {
  await setup(page);
  const button = await future(page, "a");
  await expect(page.locator("#video")).toHaveJSProperty("paused", false);
  await button.press("Space");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pin-dialog")).toBeHidden();
  await expect(page.locator("#video")).toHaveJSProperty("paused", false);
  await button.press("Enter");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/b.mp4");
});

test("Watch requires PIN, cancellation preserves playback; approval plays the protected channel", async ({ page }) => {
  await setup(page);
  await (await future(page, "a")).click();
  await page.clock.fastForward(300_000);
  await expect.poll(() => messages(page)).toHaveLength(1);
  await page.locator("#notif-bell").click();
  await page.locator(".notification-watch").click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/b.mp4");
  await page.locator(".notification-watch").click();
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/a.mp4");
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
});

test("notifications need explicit consent; a custom lead time is saved without interrupting editing", async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => (window as unknown as { permissionRequests: number }).permissionRequests)).toBe(0);
  await nav(page, "Настройки").click();
  await page.locator("#reminder-minutes").fill("10");
  await page.clock.fastForward(2000);
  await expect(page.locator("#reminder-minutes")).toHaveValue("10");
  await page.locator("#reminder-minutes").blur();
  await page.locator("#reminder-desktop").check();
  await expect.poll(() => page.evaluate(() => (window as unknown as { permissionRequests: number }).permissionRequests)).toBe(1);
  await nav(page, "Каналы").click();
  await (await future(page)).click();
  await page.clock.fastForward(1000);
  await expect.poll(() => messages(page)).toHaveLength(1);
  expect((await stored(page))[0].leadMinutes).toBe(10);
  expect(await page.evaluate(() => (window as unknown as { systemReminders: unknown[] }).systemReminders.length)).toBe(1);
});

test("denied native permission leaves the in-app reminder available", async ({ page }) => {
  await setup(page, 1440, "denied");
  await nav(page, "Настройки").click();
  await page.locator("#reminder-desktop").click();
  await expect(page.locator("#reminder-desktop")).not.toBeChecked();
  await expect(page.locator("#reminder-status")).toContainText("Разрешение не получено");
  await nav(page, "Каналы").click();
  await (await future(page)).click();
  await page.clock.fastForward(300_000);
  await expect.poll(() => messages(page)).toHaveLength(1);
  expect(await page.evaluate(() => (window as unknown as { systemReminders: unknown[] }).systemReminders.length)).toBe(0);
});

test("inactive-playlist reminders still fire, Watch switches playlist, hidden groups remain blocked", async ({ page }) => {
  await setup(page);
  await (await future(page)).click();
  await page.locator("#pl-switch-btn").click();
  await page.locator("#pl-switch-menu button").filter({ hasText: "two" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("iptv-hub.active-playlist.v1"))).toBe("two");
  await page.clock.fastForward(300_000);
  await expect.poll(() => messages(page)).toHaveLength(1);
  await page.locator("#notif-bell").click();
  await page.locator(".notification-watch").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("iptv-hub.active-playlist.v1"))).toBe("one");
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/b.mp4");
  const other = await page.context().newPage();
  await other.goto("/");
  await other.evaluate(() => localStorage.setItem("iptv-hub.groups.v1:one", JSON.stringify({ hidden: ["Open"], order: [] })));
  await expect(page.locator("#player-bar")).toBeHidden();
  await page.locator("#notif-bell").click();
  await page.locator(".notification-watch").click();
  await expect(page.locator("#toast")).toContainText("удалён или скрыт");
  await expect(page.locator("#player-bar")).toBeHidden();
});

test("two open tabs deliver once; a missed start is cleaned without a late reminder", async ({ page, context }) => {
  await setup(page);
  await (await future(page)).click();
  const other = await context.newPage();
  await other.goto("/");
  await page.clock.fastForward(300_000);
  await page.clock.fastForward(1000);
  await expect.poll(() => messages(page)).toHaveLength(1);
  expect(await messages(other)).toHaveLength(1);
  await other.evaluate((start) => {
    const key = "iptv-hub.reminders.v1:one";
    const list = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify([...list, { ...list[0], title: "Missed programme", start: start + 60_000, notified: false }]));
  }, start);
  await page.close();
  await other.close();
  const reopened = await context.newPage();
  await reopened.clock.install({ time: start + 60_001 });
  await reopened.goto("/");
  await reopened.clock.fastForward(1000);
  await expect.poll(() => stored(reopened)).toHaveLength(0);
  expect(await messages(reopened)).toHaveLength(1);
});
