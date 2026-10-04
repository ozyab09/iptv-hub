import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// #380: style.css — только точка входа с @import секций; относительные url()
// в секциях указывают от их собственной папки (src/styles/), иначе шрифты
// молча выпадают из сборки.
describe("style sections", () => {
  const entry = readFileSync("src/style.css", "utf-8");

  it("components.css первым, затем все секции src/styles в порядке каскада", () => {
    const imports = [...entry.matchAll(/@import "([^"]+)";/g)].map((m) => m[1]);
    expect(imports[0]).toBe("./components.css");
    const sections = readdirSync("src/styles").filter((f) => f.endsWith(".css")).map((f) => `./styles/${f}`);
    expect([...imports.slice(1)].sort()).toEqual(sections.sort());
    expect(entry.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import "[^"]+";/g, "").trim()).toBe("");
  });

  it("относительные url() в секциях ведут к существующим файлам", () => {
    for (const file of readdirSync("src/styles")) {
      const path = join("src/styles", file);
      for (const m of readFileSync(path, "utf-8").matchAll(/url\(\s*["']?(\.{1,2}\/[^"')]+)["']?\s*\)/g)) {
        expect(existsSync(join(dirname(path), m[1]!)), `${file}: ${m[1]}`).toBe(true);
      }
    }
  });
});
