import { defineConfig } from "@playwright/test";

const previewPort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const previewUrl = `http://localhost:${previewPort}`;

/**
 * Playwright РїСЂРѕРіРѕРЅСЏРµС‚ СЃС‚СЂСѓРєС‚СѓСЂРЅС‹Рµ smoke-РїСЂРѕРІРµСЂРєРё РІС‘СЂСЃС‚РєРё (Р±РµР· РїРёРєСЃРµР»СЊРЅС‹С…
 * СЃРЅРµРїС€РѕС‚РѕРІ). РЎРµСЂРІРµСЂ Playwright РїРѕРґРЅРёРјР°РµС‚ СЃР°Рј: vite preview РїСЂРѕРґР°-СЃР±РѕСЂРєРё
 * (РїРѕСЂС‚ 4173) вЂ” Р·РЅР°С‡РёС‚, РїРµСЂРµРґ Р·Р°РїСѓСЃРєРѕРј РЅСѓР¶РµРЅ `npm run build`.
 */
export default defineConfig({
  testDir: "tests/visual",
  timeout: 30_000,
  // РћРґРёРЅ СЂРµС‚СЂР°Р№ РІ CI: СЃС‚СЂСѓРєС‚СѓСЂРЅС‹Рµ РїСЂРѕРІРµСЂРєРё РІС‘СЂСЃС‚РєРё РёРЅРѕРіРґР° Р»РѕРІСЏС‚
  // РїСЂРѕРјРµР¶СѓС‚РѕС‡РЅС‹Р№ layout (СЃС‚Р°С‚СѓСЃ РёРіСЂРѕРєР° РµС‰С‘ РЅРµ СѓР¶Р°Р»СЃСЏ РґРѕ max-width),
  // Рё РїР°РґРµРЅРёРµ С‚Р°РєРѕРіРѕ С‚РµСЃС‚Р° Р±Р»РѕРєРёСЂРѕРІР°Р»Рѕ СЂРµР»РёР· APK.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : 1,
  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? previewUrl,
    locale: "ru-RU",
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx vite preview --port ${previewPort} --strictPort`,
    url: previewUrl,
    timeout: 30_000,
    // Р§СѓР¶РѕР№ preview РјРѕР¶РµС‚ РѕС‚РґР°РІР°С‚СЊ РґСЂСѓРіСѓСЋ СЃР±РѕСЂРєСѓ РёР»Рё РјРµРЅСЏС‚СЊСЃСЏ РІРѕ РІСЂРµРјСЏ С‚РµСЃС‚Р°.
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", workers: process.env.CI ? 3 : 1, use: { browserName: "chromium" } },
    {
      name: "firefox-media", workers: 1,
      testMatch: /(external-subtitles|recording-playback|multi-view|channel-mirrors|channel-health|timeshift|scheduled-recordings|xtream|xtream-catalogue|custom-epg|all-playlists|numeric-zap|volume-boost|programme-start|timeline-guide|reminders|backup-v2|backup-local|source-timeout|i18n-media)\.spec\.ts/,
      use: {
        browserName: "firefox",
        launchOptions: { firefoxUserPrefs: { "media.videocontrols.picture-in-picture.video-toggle.enabled": false } },
      },
    },
  ],
  reporter: [["list"]],
});
