import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function openFixture(page: Page, width = 1440, theme = "dark"): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  const media = readFileSync("tests/fixtures/recording.mp4");
  const date = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const now = Date.now();
  await page.route("https://fixture.test/**", (route) => {
    const url = route.request().url();
    if (url.endsWith(".xml")) return route.fulfill({ body: `<tv><channel id="a"><display-name>Alpha</display-name></channel><programme channel="a" start="${date(now - 3600000)}" stop="${date(now - 60000)}"><title>Archive show</title></programme></tv>` });
    if (url.includes(".mp4")) return route.fulfill({ contentType: "video/mp4", body: media });
    return route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="Locked" catchup="default" catchup-days="7" catchup-source="https://fixture.test/archive.mp4?utc={utc}",Alpha\nhttps://fixture.test/a.mp4\n#EXTINF:-1 group-title="Open",Beta\nhttps://fixture.test/b.mp4\n' });
  });
  await page.addInitScript((theme) => {
    if (!localStorage.getItem("iptv-hub.playlists.v1")) {
      localStorage.setItem("iptv-hub.theme.v1", theme);
      localStorage.setItem("iptv-hub.language.v1", "en");
      localStorage.setItem("iptv-hub.playlists.v1", JSON.stringify([
        { id: "one", name: "One", playlistUrl: "https://fixture.test/one.m3u", epgUrl: "https://fixture.test/epg.xml" },
        { id: "two", name: "Two", playlistUrl: "https://fixture.test/two.m3u", epgUrl: null },
      ]));
      localStorage.setItem("iptv-hub.active-playlist.v1", "one");
    }
  }, theme);
  await page.goto("/");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
}

async function navigate(page: Page, name: string): Promise<void> {
  await page.locator("#side-nav button, #tabbar button").filter({ hasText: name, visible: true }).first().click();
}

async function enterPin(page: Page, pin: string): Promise<void> {
  await page.locator("#parental-pin").fill(pin);
  await page.locator('#pin-dialog button[type="submit"]').click();
}

async function protect(page: Page): Promise<void> {
  await navigate(page, "Settings");
  await page.locator("#pin-group").selectOption("Locked");
  await page.locator("#pin-set").click();
  await page.locator("#parental-pin").fill("0123");
  await page.locator('#pin-dialog [name="confirmation"]').fill("0124");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator('#pin-dialog [role="alert"]')).toHaveText("PINs do not match");
  await page.locator('#pin-dialog [name="confirmation"]').fill("0123");
  await page.locator('#pin-dialog button[type="submit"]').click();
  await expect(page.locator("#pin-dialog")).not.toBeVisible();
  await expect(page.locator("#pin-set")).toBeDisabled();
  const raw = await page.evaluate(() => localStorage.getItem("iptv-hub.parental-pins.v1:one"));
  expect(JSON.parse(raw!)[0]).toMatchObject({ group: "Locked", salt: expect.stringMatching(/^[a-f0-9]{32}$/), hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  await navigate(page, "Channels");
}

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`PIN blocks category and playback; removal requires PIN (${width}, ${theme})`, async ({ page }) => {
      await openFixture(page, width, theme);
      const rows = page.locator("#channel-list .channel-card");
      await rows.first().click();
      await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/a.mp4");
      await protect(page);
      await expect(page.locator("#video")).not.toHaveAttribute("src", /a\.mp4/);
      const category = page.locator("#categories button").filter({ hasText: "Locked" });
      if (await category.isVisible()) await category.click();
      else {
        await page.locator("#btn-categories").click();
        await page.locator("#cat-menu button").filter({ hasText: "Locked" }).click();
      }
      await expect(page.locator("#pin-dialog")).toBeVisible();
      await enterPin(page, "9999");
      await expect(page.locator('#pin-dialog [role="alert"]')).toHaveText("Incorrect PIN");
      await page.screenshot({ path: `test-results/pin-${width}-${theme}.png` });
      await page.keyboard.press("Escape");
      await expect(rows).toHaveCount(2);
      if (await category.isVisible()) await category.click();
      else await page.locator("#cat-menu button").filter({ hasText: "Locked" }).click();
      await enterPin(page, "0123");
      await expect(rows).toHaveCount(1);
      await rows.first().click();
      await expect(page.locator("#pin-dialog")).toBeVisible();
      await enterPin(page, "0123");
      await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/a.mp4");
      await navigate(page, "Settings");
      await page.locator("#pin-group").selectOption("Locked");
      await page.locator("#pin-remove").click();
      await enterPin(page, "9999");
      await expect(page.locator('#pin-dialog [role="alert"]')).toHaveText("Incorrect PIN");
      await enterPin(page, "0123");
      await expect(page.locator("#pin-dialog")).not.toBeVisible();
      await expect(page.locator("#pin-set")).toBeEnabled();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("iptv-hub.parental-pins.v1:one")!).length)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test("PIN covers deep links, ZAP, favourites, search/archive and multi-view", async ({ page }) => {
  await openFixture(page);
  await protect(page);
  await page.goto("/?ch=" + encodeURIComponent("https://fixture.test/a.mp4"));
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await expect(page.locator("#video")).not.toHaveAttribute("src", /a\.mp4/);
  await page.locator("[data-pin-cancel]").click();
  await page.locator("#channel-list .channel-card").filter({ hasText: "Alpha" }).locator(".star").click();
  await navigate(page, "Favorites");
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await page.locator("[data-pin-cancel]").click();
  await navigate(page, "Channels");
  await page.locator("#channel-list .channel-card").filter({ hasText: "Beta" }).click();
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/b.mp4");
  await page.locator("#video").click();
  await page.locator("#btn-prev").click();
  await enterPin(page, "9999");
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/b.mp4");
  await enterPin(page, "0123");
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/a.mp4");
  await page.locator("#btn-multi-view").click();
  await page.locator(".multi-select").nth(1).click();
  await page.locator("#channel-list .channel-card").filter({ hasText: "Alpha" }).click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await page.locator("[data-pin-cancel]").click();
  await expect(page.locator(".multi-tile video").nth(1)).not.toHaveAttribute("src", /a\.mp4/);
  await page.locator("#multi-close").click();
  await page.locator("#search").fill("Archive show");
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(1);
  await page.locator("#channel-list .channel-card").click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await expect(page.locator("#video")).not.toHaveAttribute("src", /archive/);
  await enterPin(page, "0123");
  await expect(page.locator("#video")).toHaveAttribute("src", /archive\.mp4/);
});

test("a lock set in another tab stops playback and requires PIN", async ({ page, context }) => {
  await openFixture(page);
  await page.locator("#channel-list .channel-card").first().click();
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/a.mp4");
  const other = await context.newPage();
  await openFixture(other);
  await protect(other);
  await expect(page.locator("#video")).not.toHaveAttribute("src", /a\.mp4/);
  await page.locator("#channel-list .channel-card").first().click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
});

test("cancelling while the hash is calculated does not save a PIN", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => {
    const derive = crypto.subtle.deriveBits.bind(crypto.subtle);
    crypto.subtle.deriveBits = async (...args: Parameters<typeof derive>) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return derive(...args);
    };
  });
  await navigate(page, "Settings");
  await page.locator("#pin-set").click();
  await page.locator('#pin-dialog [name="confirmation"]').fill("0123");
  await enterPin(page, "0123");
  await page.locator("[data-pin-cancel]").click();
  await expect(page.locator("#pin-dialog")).not.toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => localStorage.getItem("iptv-hub.parental-pins.v1:one"))).toBeNull();
  await expect(page.locator("#pin-set")).toBeEnabled();
});

test("PIN persists across reloads, is isolated per playlist and survives alias reset", async ({ page }) => {
  await openFixture(page);
  await protect(page);
  await page.reload();
  await expect(page.locator("#channel-list .channel-card")).toHaveCount(2);
  await page.locator("#channel-list .channel-card").first().click();
  await expect(page.locator("#pin-dialog")).toBeVisible();
  await page.locator("[data-pin-cancel]").click();
  await navigate(page, "Settings");
  await page.locator("#channel-overrides-reset").click();
  await expect(page.locator("#pin-set")).toBeDisabled();
  await page.locator("#pl-switch-btn").click();
  await page.locator("#pl-switch-menu button").filter({ hasText: "Two" }).click();
  await navigate(page, "Channels");
  await page.locator("#channel-list .channel-card").first().click();
  await expect(page.locator("#video")).toHaveAttribute("src", "https://fixture.test/a.mp4");
  await expect(page.locator("#pin-dialog")).not.toBeVisible();
});
