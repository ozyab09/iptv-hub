import { defineConfig } from "@playwright/test";

/**
 * Playwright прогоняет структурные smoke-проверки вёрстки (без пиксельных
 * снепшотов). Сервер Playwright поднимает сам: vite preview прода-сборки
 * (порт 4173) — значит, перед запуском нужен `npm run build`.
 */
export default defineConfig({
  testDir: "tests/visual",
  timeout: 30_000,
  // Один ретрай в CI: структурные проверки вёрстки иногда ловят
  // промежуточный layout (статус игрока ещё не ужался до max-width),
  // и падение такого теста блокировало релиз APK.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? "http://localhost:4173",
    locale: "ru-RU",
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox-media", testMatch: /(recording-playback|multi-view|channel-mirrors|timeshift|scheduled-recordings|xtream|numeric-zap)\.spec\.ts/, use: { browserName: "firefox" } },
  ],
  reporter: [["list"]],
});
