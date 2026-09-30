/**
 * Версия service worker'а от содержимого сборки.
 *
 * Браузер переустанавливает SW, только если изменились байты sw.js. Раньше
 * VERSION поднимали руками: забыли — и у пользователей оставались старые
 * кэши, а открытая вкладка жила на прошлой вёрстке. Теперь при сборке к
 * версии дописывается хэш index.html: в нём имена ассетов с хэшами, так что
 * любая правка кода или стилей даёт новый sw.js, новый кэш и обновление.
 */
import { createHash } from "node:crypto";

const VERSION_RE = /const VERSION = "(v\d+\.\d+\.\d+)[^"]*";/;

export function buildId(indexHtml: string): string {
  return createHash("sha256").update(indexHtml).digest("hex").slice(0, 10);
}

/** `const VERSION = "v0.2.4"` → `const VERSION = "v0.2.4+<хэш сборки>"`. */
export function stampVersion(swSource: string, indexHtml: string): string {
  const m = VERSION_RE.exec(swSource);
  if (!m) throw new Error("sw.js: не найдено `const VERSION = \"vX.Y.Z\"`");
  return swSource.replace(VERSION_RE, `const VERSION = "${m[1]}+${buildId(indexHtml)}";`);
}
