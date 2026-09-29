import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FILLED_ICONS, ICONS, iconMarkup, spriteMarkup } from "../src/icons";

const here = dirname(fileURLToPath(import.meta.url));
const root = (...p: string[]): string => join(here, "..", ...p);
const html = readFileSync(root("index.html"), "utf-8");
const mainTs = readFileSync(root("src", "main.ts"), "utf-8");

describe("набор иконок", () => {
  it("каждая фигура рисуется в сетке 24×24", () => {
    // Координаты вне 0..24 означают, что иконка нарисована в другой сетке
    // и рядом с остальными будет выбиваться по размеру.
    for (const [name, body] of Object.entries(ICONS)) {
      // В относительных командах пути числа — это сдвиги, и они бывают
      // отрицательными; за сетку выводит именно модуль.
      const numbers = [...body.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      for (const n of numbers) {
        expect(Math.abs(n), `${name}: координата ${n} вне сетки`).toBeLessThanOrEqual(24);
      }
    }
  });

  it("фигуры не задают штрих и заливку сами — это делает класс .i", () => {
    for (const [name, body] of Object.entries(ICONS)) {
      expect(body, `${name}`).not.toContain("stroke=");
      expect(body, `${name}`).not.toContain("fill=");
      expect(body, `${name}`).not.toContain("style=");
    }
  });

  it("заливкой рисуются только разрешённые дизайн-системой", () => {
    expect([...FILLED_ICONS].sort()).toEqual(["pause", "play", "record", "star-on"]);
    for (const name of FILLED_ICONS) {
      expect(ICONS[name], `${name} отсутствует в наборе`).toBeDefined();
      expect(iconMarkup(name)).toContain("i-fill");
    }
    expect(iconMarkup("close")).not.toContain("i-fill");
  });

  it("спрайт содержит symbol на каждую иконку", () => {
    const sprite = spriteMarkup();
    for (const name of Object.keys(ICONS)) {
      expect(sprite).toContain(`<symbol id="i-${name}" viewBox="0 0 24 24">`);
    }
  });
});

/** Имена иконок, на которые ссылаются разметка и код. */
function referenced(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/href="#i-([a-z-]+)"/g)) names.add(m[1]!);
  for (const m of source.matchAll(/setIcon\([^,]+,\s*"([a-z-]+)"\)/g)) names.add(m[1]!);
  return names;
}

describe("связь разметки и набора", () => {
  it("каждая иконка из index.html есть в наборе", () => {
    const used = referenced(html);
    expect(used.size, "в разметке нет ссылок на иконки").toBeGreaterThan(15);
    for (const name of used) {
      expect(ICONS[name], `в наборе нет иконки ${name}`).toBeDefined();
    }
  });

  it("каждая иконка, выставляемая из кода, есть в наборе", () => {
    for (const name of referenced(mainTs)) {
      expect(ICONS[name], `в наборе нет иконки ${name}`).toBeDefined();
    }
  });

  it("темы переключаются именами иконок, а не глифами", () => {
    for (const name of ["sun", "moon"]) {
      expect(ICONS[name], `нет иконки ${name}`).toBeDefined();
    }
  });
});

describe("эмодзи в интерфейсе", () => {
  // Дизайн-система запрещает эмодзи: они выглядят по-разному в каждой ОС
  // и не перекрашиваются под тему.
  const EMOJI =
    /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2460}-\u{24FF}\u{25A0}-\u{25FF}]/u;

  it("index.html не содержит эмодзи и глифов-иконок", () => {
    // Значения атрибутов вырезаем: «(←)» в title — подсказка клавиши, не иконка.
    const lines = html
      .replace(/<[a-z][^>]*>/gi, (tag) => tag.replace(/"[^"]*"/g, '""'))
      .split("\n");
    const bad = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => EMOJI.test(line));
    expect(bad.map((b) => `${b.n}: ${b.line.trim()}`)).toEqual([]);
  });

  it("main.ts не выставляет эмодзи в textContent", () => {
    const bad = mainTs
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /textContent\s*=/.test(line) && EMOJI.test(line));
    expect(bad.map((b) => `${b.n}: ${b.line.trim()}`)).toEqual([]);
  });
});

describe("доступность", () => {
  it("у каждой кнопки с одной иконкой есть aria-label", () => {
    // <button …>…<svg …/></button> без подписи — немая кнопка для скринридера.
    const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
    const iconOnly = buttons.filter(([, inner]) => {
      const text = inner!.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "");
      return inner!.includes("<use href=\"#i-") && text.trim() === "";
    });
    expect(iconOnly.length, "кнопок с одной иконкой не найдено").toBeGreaterThan(10);
    for (const [tag] of iconOnly) {
      expect(tag, `нет aria-label: ${tag!.slice(0, 90)}`).toContain("aria-label=");
    }
  });

  it("svg иконок скрыты от скринридера", () => {
    for (const [tag] of html.matchAll(/<svg class="i[^"]*"[^>]*>/g)) {
      expect(tag).toContain('aria-hidden="true"');
    }
  });
});

describe("соседние кнопки различимы", () => {
  it("театр и полный экран нарисованы по-разному", () => {
    // Обе кнопки стоят рядом в плеере. Пока обе были четырьмя уголками,
    // отличить их можно было только по подсказке при наведении.
    const theater = ICONS["theater"]!;
    const fullscreen = ICONS["fullscreen"]!;
    expect(theater).not.toBe(fullscreen);
    // Разные примитивы, а не разный набор координат одной и той же фигуры.
    expect(theater).toContain("<rect");
    expect(fullscreen).not.toContain("<rect");
  });

  it("развернуть и свернуть плеер — не одна и та же иконка", () => {
    expect(ICONS["pip"]).not.toBe(ICONS["theater"]);
    expect(ICONS["pip"]).not.toBe(ICONS["fullscreen"]);
  });
});
