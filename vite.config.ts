import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import { stampVersion } from "./src/sw-version";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/**
 * Версия для сборки: APP_VERSION из CI (её вычисляет CI из git-тега) либо
 * version из package.json как запасной вариант для локальных сборок.
 */
const appVersion = process.env.APP_VERSION?.trim() || pkg.version;
const versionProperties = readFileSync(new URL("./android/version.properties", import.meta.url), "utf8");
const appVersionCode = Number(versionProperties.match(/^versionCode=(\d+)\s*$/m)?.[1]);

/**
 * После сборки проставляет в dist/sw.js версию приложения и хэш index.html:
 * каждый деплой с изменённым кодом или стилями — новый service worker и
 * новый кэш, без ручного подъёма VERSION (см. src/sw-version.ts).
 */
function stampServiceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "stamp-service-worker",
    apply: "build",
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    writeBundle() {
      const sw = join(outDir, "sw.js");
      const html = readFileSync(join(outDir, "index.html"), "utf-8");
      writeFileSync(sw, stampVersion(readFileSync(sw, "utf-8"), html, appVersion));
    },
  };
}

// base обязателен: сайт живёт на https://<user>.github.io/iptv-hub/ (подпуть),
// без него Vite кладёт в HTML абсолютные /assets/... → 404 на Pages.
// Относительный base также разрешает открывать dist/ с любого пути (file://, локальные серверы).
export default defineConfig({
  base: "./",
  plugins: [stampServiceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_VERSION_CODE__: appVersionCode,
  },
  build: {
    // Дефолтный лимит 500 КБ ниже веса самого hls.js (~594 КБ): библиотека одна,
    // разделить её нельзя, а ручной vendor-чанк уже вынесен (см. ниже).
    // Лимит поднят до 700 КБ, чтобы warning не маскировал реальные регрессии
    // размера бандла собственного кода приложения.
    chunkSizeWarningLimit: 700,
    // hls.js + транзитивные полилибы весят ~775 КБ — выносим в vendor-чанк,
    // чтобы приложение и браузер не ждали миллионов строк из одного файла.
    // Не влияет на строгий типчек, только на размер бандла и кэш.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["hls.js"],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Один fork быстрее двух на текущем наборе тестов (см. AGENTS.md, #308).
    // Внутри файлов сохраняем последовательность: тесты используют fake timers и моки.
    sequence: { concurrent: false },
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
