import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ timezoneId: "UTC", serviceWorkers: "block" });
const midnight = Date.parse("2026-10-03T00:00:00Z");
const url = (i: number) => `https://fixture.test/${i}.mp4`;
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";

async function setup(page: Page, count = 5, width = 1440, epg = true) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install({ time: midnight + 12.25 * 3_600_000 });
  let epgRequests = 0;
  const channels = Array.from({ length: count }, (_, i) => `#EXTINF:-1 tvg-id="c${i}" group-title="${i === 2 ? "Locked" : i === 3 ? "Hidden" : i === 5 ? "Other" : "Main"}" catchup-days="${i === 0 ? 0 : 3}" catchup-source="https://fixture.test/${i}-archive.mp4?utc={utc}",Channel ${String(i).padStart(4, "0")}\n${url(i)}`).join("\n");
  const xml = epg ? `<tv>${Array.from({ length: count }, (_, i) => {
    const channel = `<channel id="c${i}"><display-name>Channel ${String(i).padStart(4, "0")}</display-name></channel>`;
    return channel + Array.from({ length: 48 }, (_, slot) => `<programme channel="c${i}" start="${stamp(midnight + slot * 1_800_000)}" stop="${stamp(midnight + (slot + 1) * 1_800_000)}"><title>Show ${i} slot ${slot}</title></programme>`).join("");
  }).join("")}</tv>` : "";
  await page.route("https://fixture.test/**", (route) => {
    if (route.request().url().includes(".mp4")) return route.fulfill({ contentType: "video/mp4", body: readFileSync("tests/fixtures/recording.mp4") });
    if (route.request().url().endsWith(".xml")) {
      epgRequests++;
      return route.fulfill({ contentType: "application/xml", body: xml });
    }
    return route.fulfill({ body: `#EXTM3U\n${channels}\n` });
  });
  await page.addInitScript(({ epg }) => {
    if (localStorage.getItem("iptv-hub.playlists.v1")) return;
    localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([{ id: "test", name: "TV", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: epg ? "https://fixture.test/epg.xml" : null }]));
    localStorage.setItem("iptv-hub.active-playlist.v1", "test");
    localStorage.setItem("iptv-hub.groups.v1:test", JSON.stringify({ hidden: ["Hidden"], order: [] }));
    localStorage.setItem("iptv-hub.parental-pins.v1:test", JSON.stringify([{ group: "Locked", salt: "0".repeat(32), hash: "0".repeat(64) }]));
    localStorage.setItem("iptv-hub.channel-overrides.v1:test", JSON.stringify([{ url: "https://fixture.test/4.mp4", hidden: true }, { url: "https://fixture.test/1.mp4", alias: "Alias One" }]));
    localStorage.setItem("iptv-hub.favorites.v1:test", JSON.stringify(["https://fixture.test/1.mp4"]));
  }, { epg });
  await page.goto("/");
  await page.locator('#channel-list .channel-card[data-channel-url="https://fixture.test/0.mp4"]').click();
  await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
  if (epg) await expect(page.locator("#now-show")).toHaveText("Show 0 slot 24");
  await page.keyboard.press("g");
  await expect(page.locator("#guide-overlay")).toBeVisible();
  return () => epgRequests;
}

const grid = (page: Page) => page.locator("#guide-grid");
const row = (page: Page, i: number) => page.locator(`.timeline-row[data-url="${url(i)}"]`);

for (const width of [1024, 1440]) {
  test(`grid plays real live/archive media and excludes hidden/PIN channels (${width})`, async ({ page }) => {
    const requests = await setup(page, 5, width);
    await page.locator("#guide-mode-grid").click();
    await expect(grid(page)).toBeVisible();
    await expect(page.locator(".timeline-row")).toHaveCount(2);
    await expect(row(page, 1).locator(".timeline-channel")).toHaveText("Alias One");
    await expect(row(page, 0).getByRole("button", { name: /Show 0 slot 23$/ })).toBeDisabled();
    await expect(row(page, 1).getByRole("button", { name: /Show 1 slot 25$/ })).toBeDisabled();
    const live = row(page, 1).getByRole("button", { name: /Show 1 slot 24$/ });
    expect(await live.evaluate((el) => (el as HTMLElement).style.width)).toBe("96px");
    await live.click();
    await expect(page.locator("#guide-overlay")).toBeHidden();
    await expect(page.locator("#video")).toHaveAttribute("src", url(1));
    await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
    await page.keyboard.press("g");
    await row(page, 1).getByRole("button", { name: /Show 1 slot 23$/ }).click();
    await expect(page.locator("#video")).toHaveAttribute("src", `https://fixture.test/1-archive.mp4?utc=${Math.floor((midnight + 23 * 1_800_000) / 1000)}`);
    await expect(page.locator("#video")).toHaveJSProperty("videoWidth", 160);
    expect(requests()).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("2600-channel grid virtualizes rows and half-hour columns while scrolling both axes", async ({ page }) => {
  test.setTimeout(60_000);
  const requests = await setup(page, 2600);
  await page.locator("#guide-mode-grid").click();
  await expect(row(page, 0)).toBeVisible();
  expect(await page.locator(".timeline-row").count()).toBeLessThan(20);
  expect(await page.locator(".timeline-cell").count()).toBeLessThan(240);
  const scroll = grid(page);
  // Several distant jumps exercise recycling, including the last channel/time slot.
  for (const fraction of [.2, .8, .4, 1]) {
    const previous = await page.locator(".timeline-row").first().getAttribute("data-url");
    await scroll.evaluate((el, f) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * f; el.scrollLeft = (el.scrollWidth - el.clientWidth) * f; }, fraction);
    await expect.poll(() => page.locator(".timeline-row").first().getAttribute("data-url")).not.toBe(previous);
    expect(await page.locator(".timeline-row").count()).toBeLessThan(20);
    expect(await page.locator(".timeline-cell").count()).toBeLessThan(240);
  }
  await expect(row(page, 2599)).toBeVisible();
  await expect(row(page, 2599).getByRole("button", { name: /Show 2599 slot 47$/ })).toBeVisible();
  await expect(row(page, 0)).toHaveCount(0);
  await expect(page.locator(".timeline-time").last()).toHaveText("23:30");
  const label = await row(page, 2599).locator(".timeline-channel").boundingBox();
  const bounds = await scroll.boundingBox();
  expect(Math.abs(label!.x - bounds!.x)).toBeLessThan(3);
  expect(requests()).toBe(1);
  await page.screenshot({ path: "test-results/timeline-guide-2600.png" });
});

test("grid respects category and day selection when switching modes", async ({ page }) => {
  const requests = await setup(page, 6);
  await page.keyboard.press("Escape");
  await page.locator("#btn-categories").click();
  await page.locator("#cat-menu button").filter({ hasText: "Other" }).click();
  await page.keyboard.press("g");
  await page.locator("#guide-mode-grid").click();
  await expect(page.locator(".timeline-row")).toHaveCount(1);
  await expect(row(page, 5)).toBeVisible();
  await page.locator("#guide-days button").filter({ hasText: "Вчера" }).click();
  await expect(page.locator(".timeline-cell")).toHaveCount(0);
  await page.locator("#guide-mode-list").click();
  await expect(page.locator("#guide-list")).toContainText("Нет данных");
  await expect(page.locator("#guide-days .on")).toHaveText("Вчера");
  await page.locator("#guide-mode-grid").click();
  await page.locator("#guide-days button").filter({ hasText: "Сегодня" }).click();
  await expect(row(page, 5).getByRole("button", { name: /Show 5 slot 24$/ })).toBeVisible();
  expect(requests()).toBe(1);
});

test("grid follows the current favorites section and refreshes after protection in another tab", async ({ page, context }) => {
  await setup(page);
  await page.keyboard.press("Escape");
  await page.locator("#side-nav button").filter({ hasText: "Избранное", visible: true }).first().click();
  await page.keyboard.press("g");
  await page.locator("#guide-mode-grid").click();
  await expect(page.locator(".timeline-row")).toHaveCount(1);
  await expect(row(page, 1)).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate(() => localStorage.setItem("iptv-hub.parental-pins.v1:test", JSON.stringify([{ group: "Main", salt: "0".repeat(32), hash: "0".repeat(64) }])));
  await expect(page.locator(".timeline-row")).toHaveCount(0);
  await expect(page.locator(".timeline-empty")).toBeVisible();
  await page.locator("#guide-mode-list").click();
  await expect(page.locator("#guide-list")).toBeVisible();
  await expect(grid(page)).toBeHidden();
});

for (const width of [390, 1023]) {
  test(`narrow screen refuses grid and retains the list (${width})`, async ({ page }) => {
    await setup(page, 5, width);
    await page.locator("#guide-mode-grid").click();
    await expect(page.locator("#toast")).toContainText("от 1024");
    await expect(grid(page)).toBeHidden();
    await expect(page.locator("#guide-list")).toBeVisible();
    await expect(page.locator("#guide-mode-list")).toHaveAttribute("aria-pressed", "true");
  });
}

test("missing EPG is safe; narrowing an open grid returns to list", async ({ page }) => {
  const requests = await setup(page, 5, 1440, false);
  await page.locator("#guide-mode-grid").click();
  await expect(grid(page)).toBeVisible();
  await expect(page.locator(".timeline-cell")).toHaveCount(0);
  await expect(page.locator(".timeline-row")).toHaveCount(2);
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(grid(page)).toBeHidden();
  await expect(page.locator("#guide-list")).toContainText("Нет данных");
  await expect(page.locator("#toast")).toContainText("от 1024");
  expect(requests()).toBe(0);
});
