import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Стили приложения как один текст (#380): `src/style.css` и секции, которые
 * он подключает через `@import "./styles/…"`, в порядке подключения —
 * то же, что видит браузер после сборки. components.css не входит.
 */
export function readAppStyles(stylePath: string): string {
  const entry = readFileSync(stylePath, "utf-8");
  const sections = [...entry.matchAll(/@import "\.\/(styles\/[^"]+\.css)";/g)]
    .map((m) => readFileSync(join(dirname(stylePath), m[1]!), "utf-8"));
  return [entry, ...sections].join("\n");
}
