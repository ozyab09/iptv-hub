import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
// Виртуальный список каналов живёт в channel-list-ui.ts (#367).
const listTs = readFileSync(root("src", "channel-list-ui.ts"), "utf-8");
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
    // main.ts и вынесенные из него DOM-модули (#364–#370).
    const uiModules = ["channel-list-ui.ts", "guide-ui.ts", "recordings-ui.ts", "scrub-ui.ts", "backup-ui.ts", "screenshot-ui.ts"]
      .filter((file) => existsSync(root("src", file)))
      .map((file) => readFileSync(root("src", file), "utf-8"));
    for (const source of [mainTs, ...uiModules]) {
      for (const m of source.matchAll(/className = "([^"]+)"/g)) {
        for (const c of m[1]!.split(/\s+/)) used.add(c);
      }
      for (const m of source.matchAll(/return "([a-z][a-z0-9 -]*)"/g)) {
        for (const c of m[1]!.split(/\s+/)) used.add(c);
      }
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
    // Исключение одно — контролы поверх видео: дизайн-система требует, чтобы
    // они были белыми на чёрном в ЛЮБОЙ теме, поэтому токены темы там
    // неприменимы. Всё остальное на хексах означает расхождение с системой.
    const withoutVideo = components.replace(/\.video[^{]*\{[^}]*\}/g, "");
    const hexes = [...withoutVideo.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
    expect(hexes).toEqual([]);
  });

  it("контролы на видео белые на чёрном, а не на токенах темы", () => {
    // Попади сюда var(--text) или var(--surface-*), в светлой теме контролы
    // стали бы тёмными поверх тёмного кадра.
    const video = components.match(/\.video[^{]*\{[^}]*\}/g)?.join("\n") ?? "";
    expect(video).not.toContain("var(--text)");
    expect(video).not.toContain("var(--surface");
    expect(video).toContain("#fff");
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
    const sources = ["main.ts", "channel-list-ui.ts", "guide-ui.ts", "player.ts", "theme.ts", "icons.ts", "ui-classes.ts"];
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

describe("подключение стилей", () => {
  it("@import идёт первым правилом — иначе браузер его отбрасывает", () => {
    // Спецификация: @import должен предшествовать всем правилам, кроме
    // @charset и @layer. Стоял 95-й строкой — components.css молча не
    // загружался, и вся вёрстка осталась без компонентных стилей.
    const firstRule = style.search(/^\s*[@.:#*a-z]/im);
    const importAt = style.indexOf('@import "./components.css"');
    expect(importAt, "components.css не подключён").toBeGreaterThanOrEqual(0);
    expect(importAt).toBe(firstRule);
  });

  it("до @import нет ничего, кроме комментариев и пустых строк", () => {
    const before = style.slice(0, style.indexOf("@import"));
    expect(before.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe("");
  });
});

describe("виртуализация и вёрстка согласованы", () => {
  it("высота .row.channel-card совпадает с CHANNEL_ROW_HEIGHT", () => {
    // Виртуализация позиционирует строки арифметикой: разойдись эти числа,
    // и прокрутка поедет тем сильнее, чем длиннее список.
    const fromJs = /const CHANNEL_ROW_HEIGHT = (\d+);/.exec(listTs)?.[1];
    const fromCss = /\.row\.channel-card\s*\{[^}]*height:\s*(\d+)px/.exec(style)?.[1];
    expect(fromJs, "константа не найдена в channel-list-ui.ts").toBeDefined();
    expect(fromCss, "height не найден в style.css").toBeDefined();
    expect(fromCss).toBe(fromJs);
  });

  it("список каналов — одна колонка строк", () => {
    expect(listTs).toMatch(/const CHANNEL_COLUMNS = 1;/);
    expect(style).toMatch(/\.virtual-inner\s*\{[^}]*flex-direction:\s*column/);
  });
});

describe("мини-плеер", () => {
  it("узкая ширина в коде и в CSS — одно число", () => {
    // Разойдись они, и на промежуточной ширине получится мини-плеер,
    // который не разворачивается, либо страница без способа свернуться.
    const fromJs = /const COMPACT_BREAKPOINT = (\d+);/.exec(mainTs)?.[1];
    expect(fromJs, "константа не найдена").toBeDefined();
    expect(style).toContain(`@media (max-width: ${fromJs}px)`);
  });

  it("отступ страницы считается от высоты таб-бара, а не от числа", () => {
    expect(style).toMatch(/--tabbar-h:\s*\d+px/);
    expect(style).toMatch(/padding-bottom:\s*calc\(var\(--tabbar-h\)/);
    expect(style).toMatch(/bottom:\s*calc\(var\(--tabbar-h\)/);
  });

  it("видео больше не скрыто мёртвым классом", () => {
    // `.player-bar.expanded` показывал видео, но класс никто не выставлял:
    // канал открывался без картинки (тот же дефект, что чинил PR #65).
    expect(style).not.toContain(".player-bar.expanded");
    expect(style).toMatch(/\.player-bar video \{[^}]*display:\s*block/);
  });
});
