import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  channelRowClass,
  chipClass,
  menuItemClass,
  programRowClass,
  qualityBadgeClass,
  starClass,
} from "../src/ui-classes";

const here = dirname(fileURLToPath(import.meta.url));
const root = (...p: string[]): string => join(here, "..", ...p);
const components = readFileSync(root("src", "components.css"), "utf-8");
const style = readFileSync(root("src", "style.css"), "utf-8");
const mainTs = readFileSync(root("src", "main.ts"), "utf-8");
const html = readFileSync(root("index.html"), "utf-8");

describe("правила дизайн-системы в выборе классов", () => {
  it("акцентом помечается только играющий канал", () => {
    expect(channelRowClass(true)).toContain("on");
    expect(channelRowClass(false)).not.toContain("on");
  });

  it("выбранный чип инвертируется, а не красится акцентом", () => {
    // `.chip.on` — это фон text на тексте bg. Если бы он красился акцентом,
    // розовый перестал бы значить «играет» и стал бы просто цветом.
    expect(chipClass(true)).toBe("chip on");
    expect(components).toMatch(/\.chip\.on\s*\{[^}]*background:\s*var\(--text\)/);
    expect(components).not.toMatch(/\.chip\.on\s*\{[^}]*background:\s*var\(--accent\)/);
  });

  it("цвет в бейдже качества есть только у 4K", () => {
    expect(qualityBadgeClass("4K")).toBe("badge q4k");
    expect(qualityBadgeClass("4k")).toBe("badge q4k");
    expect(qualityBadgeClass("FHD")).toBe("badge");
    expect(qualityBadgeClass("HD")).toBe("badge");
    expect(components).toMatch(/\.badge\.q4k\s*\{[^}]*var\(--warning\)/);
  });

  it("звезда акцентная только у избранного", () => {
    expect(starClass(true)).toBe("star on");
    expect(starClass(false)).toBe("star");
    expect(components).toMatch(/\.row \.star\.on\s*\{[^}]*var\(--accent\)/);
  });

  it("строка программы различает прошлое, эфир и будущее", () => {
    expect(programRowClass("now")).toBe("prog-row now");
    expect(programRowClass("past")).toBe("prog-row past");
    expect(programRowClass("next")).toBe("prog-row");
  });

  it("выбранный пункт меню акцентный", () => {
    expect(menuItemClass(true)).toBe("menu-item on");
    expect(menuItemClass(false)).toBe("menu-item");
  });
});

/** Классы, объявленные в файле стилей. */
function declared(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/\.(-?[a-z][a-z0-9-]*)/gi)) names.add(m[1]!);
  return names;
}

describe("компонентные стили", () => {
  const known = new Set([...declared(components), ...declared(style)]);

  it("каждый класс дизайн-системы, который использует код, объявлен", () => {
    const used = new Set<string>();
    for (const m of mainTs.matchAll(/className = "([^"]+)"/g)) {
      for (const c of m[1]!.split(/\s+/)) used.add(c);
    }
    for (const m of mainTs.matchAll(/return "([a-z][a-z0-9 -]*)"/g)) {
      for (const c of m[1]!.split(/\s+/)) used.add(c);
    }
    const missing = [...used].filter((c) => c && !known.has(c));
    expect(missing).toEqual([]);
  });

  it("каждый класс из разметки объявлен в стилях", () => {
    const used = new Set<string>();
    for (const m of html.matchAll(/class="([^"]+)"/g)) {
      for (const c of m[1]!.split(/\s+/)) used.add(c);
    }
    const missing = [...used].filter((c) => c && !known.has(c));
    expect(missing).toEqual([]);
  });

  it("компонентные стили опираются на токены, а не на хексы", () => {
    // Хекс в components.css означает, что значение разъехалось с системой.
    const hexes = [...components.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
    expect(hexes).toEqual([]);
  });

  it("файл помечен как копия — его правят в системе, а не здесь", () => {
    expect(components).toContain("bundle.css");
  });
});

describe("эмодзи не возвращаются через код", () => {
  // Прошлая версия проверки смотрела построчно и пропустила присваивание,
  // разнесённое на три строки: `textContent =` на одной, эмодзи на других.
  const EMOJI =
    /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2460}-\u{24FF}\u{25A0}-\u{25FF}]/u;

  it("ни один строковый литерал в src/*.ts не содержит эмодзи", () => {
    const sources = ["main.ts", "player.ts", "theme.ts", "icons.ts", "ui-classes.ts"];
    const bad: string[] = [];
    for (const file of sources) {
      const text = readFileSync(root("src", file), "utf-8");
      for (const m of text.matchAll(/"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`/g)) {
        const literal = m[1] ?? m[2] ?? m[3] ?? "";
        if (EMOJI.test(literal)) bad.push(`${file}: ${literal.slice(0, 40)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
