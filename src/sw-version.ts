/**
 * Версия service worker'а от содержимого сборки.
 *
 * Браузер переустанавливает SW, только если изменились байты sw.js. Раньше
 * VERSION поднимали руками: забыли — и у пользователей оставались старые
 * кэши, а открытая вкладка жила на прошлой вёрстке. Теперь при сборке к
 * версии дописывается хэш index.html: в нём имена ассетов с хэшами, так что
 * любая правка кода или стилей даёт новый sw.js, новый кэш и обновление.
 *
 * Версию приложения подставляет сборка из тега (APP_VERSION в vite.config.ts);
 * `vX.Y.Z` в public/sw.js — только значение по умолчанию для dev-сервера.
 */
import { createHash } from "node:crypto";

const VERSION_RE = /const VERSION = "[^"]*";/;

export function buildId(indexHtml: string): string {
  return createHash("sha256").update(indexHtml).digest("hex").slice(0, 10);
}

/** `const VERSION = "v0.2.27"` → `const VERSION = "v<версия из тега>+<хэш сборки>"`. */
export function stampVersion(swSource: string, indexHtml: string, version: string): string {
  if (!VERSION_RE.test(swSource)) {
    throw new Error('sw.js: не найдено `const VERSION = "..."`');
  }
  return swSource.replace(VERSION_RE, `const VERSION = "v${version}+${buildId(indexHtml)}";`);
}
