import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import { stampVersion } from "./src/sw-version";

/**
 * После сборки проставляет в dist/sw.js версию от хэша index.html: каждый
 * деплой с изменённым кодом или стилями — новый service worker и новый кэш,
 * без ручного подъёма VERSION (см. src/sw-version.ts).
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
      writeFileSync(sw, stampVersion(readFileSync(sw, "utf-8"), html));
    },
  };
}

// base обязателен: сайт живёт на https://<user>.github.io/iptv-hub/ (подпуть),
// без него Vite кладёт в HTML абсолютные /assets/... → 404 на Pages.
// Относительный base также разрешает открывать dist/ с любого пути (file://, локальные серверы).
export default defineConfig({
  base: "./",
  plugins: [stampServiceWorker()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
