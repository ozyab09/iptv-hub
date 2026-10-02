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
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
