import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Токены — контракт с дизайн-системой IPTV Hub v2, а не просто цвета в CSS.
 * Тест читает style.css напрямую и сверяет значения: если кто-то подправит
 * хекс «на глаз», сборка упадёт и напомнит, что правят систему, а не код.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = (...p: string[]): string => join(here, "..", ...p);
const css = readFileSync(root("src", "style.css"), "utf-8");

/** Вытащить тело блока: `:root {` или `:root[data-theme="light"] {`. */
function block(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`блок ${selector} не найден`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close);
}

function tokens(selector: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of block(selector).split("\n")) {
    const m = /^\s*(--[a-z0-9-]+):\s*(.+?);\s*(?:\/\*.*)?$/i.exec(line);
    if (m?.[1] && m[2]) map.set(m[1], m[2].trim());
  }
  return map;
}

const dark = tokens(":root");
const light = tokens(':root[data-theme="light"]');

/** Значения из project/tokens.json дизайн-системы, версия 2. */
const DARK: Record<string, string> = {
  "--bg": "#0c0d10",
  "--surface-1": "#15161a",
  "--surface-2": "#1d1e23",
  "--surface-3": "#27282e",
  "--border": "#2c2d33",
  "--text": "#f2f2f4",
  "--muted": "#9c9da6",
  "--accent": "#ff4fa3",
  "--accent-soft": "rgba(255, 79, 163, 0.14)",
  "--on-accent": "#0c0d10",
  "--focus": "#5b93ff",
  "--danger": "#ff6363",
  "--warning": "#f5b041",
  "--scrim": "rgba(0, 0, 0, 0.6)",
  "--video": "#060709",
};

const LIGHT: Record<string, string> = {
  "--bg": "#f6f6f8",
  "--surface-1": "#ffffff",
  "--surface-2": "#eeeef1",
  "--surface-3": "#e3e3e8",
  "--border": "#dcdce2",
  "--text": "#111216",
  "--muted": "#5b5c65",
  "--accent": "#d0176f",
  "--accent-soft": "rgba(208, 23, 111, 0.10)",
  "--on-accent": "#ffffff",
  "--focus": "#2f6ce0",
  "--danger": "#c62828",
  "--warning": "#8a5200",
  "--scrim": "rgba(17, 18, 22, 0.4)",
};

describe("цветовые токены", () => {
  it.each(Object.entries(DARK))("dark %s = %s", (name, value) => {
    expect(dark.get(name)).toBe(value);
  });

  it.each(Object.entries(LIGHT))("light %s = %s", (name, value) => {
    expect(light.get(name)).toBe(value);
  });

  it("video одинаков в обеих темах — это леттербокс за видео", () => {
    expect(dark.get("--video")).toBe("#060709");
    expect(light.has("--video")).toBe(false); // наследуется из dark
  });

  it("от палитры v1 не осталось следов", () => {
    for (const gone of ["#0b0e14", "#121722", "#161c2a", "#e6eaf2", "#8b94a7"]) {
      expect(css).not.toContain(gone);
    }
  });
});

describe("сетка и радиусы", () => {
  it("шаги отступов кратны 4px", () => {
    for (const [name, value] of dark) {
      if (!name.startsWith("--space-")) continue;
      const px = Number(value.replace("px", ""));
      expect(px % 4, `${name} = ${value}`).toBe(0);
    }
  });

  it("шкала радиусов на месте", () => {
    expect(dark.get("--radius-xs")).toBe("6px");
    expect(dark.get("--radius-md")).toBe("12px");
    expect(dark.get("--radius-lg")).toBe("16px");
    expect(dark.get("--radius-full")).toBe("999px");
  });
});

describe("шрифт", () => {
  it("Onest объявлен первым в стеке", () => {
    expect(dark.get("--font-sans")).toMatch(/^Onest,/);
  });

  it("файлы, на которые ссылается @font-face, существуют", () => {
    const refs = [...css.matchAll(/url\("\.\/(fonts\/[^"]+)"\)/g)].map((m) => m[1]);
    expect(refs.length, "должны быть latin и cyrillic").toBe(2);
    for (const ref of refs) {
      expect(existsSync(root("src", ref!)), `нет файла ${ref}`).toBe(true);
    }
  });

  it("кириллический сабсет покрывает русский алфавит", () => {
    expect(css).toContain("U+0400-045F");
  });
});

describe("вертикальное центрирование плеера (issue #82)", () => {
  // Медиа-условия в файле повторяются, поэтому секции плеера вырезаем
  // по заголовкам-комментариям, а не по строке @media.
  const wide = css.slice(
    css.indexOf("/* ---- широкий экран: плеер колонкой справа"),
    css.indexOf("/* ---- узкий экран: мини-плеер"),
  );
  const narrow = css.slice(
    css.indexOf("/* ---- узкий экран: мини-плеер"),
    css.indexOf("/* ---- нативный полный экран"),
  );

  it("wide-колонка плеера: авто-отступы детей по вертикали", () => {
    // Сам прокручиваемый контейнер центрировать нельзя: при переполнении
    // justify-content/margin-centering делает верх недостижимым прокруткой.
    expect(wide).toMatch(
      /\.watch \.player-bar > \* \{[^}]*margin-block:\s*auto;[^}]*\}/,
    );
    expect(wide).toMatch(/\.watch \.player-bar \{[^}]*margin:\s*auto 0;[^}]*\}/);
  });

  it("страница плеера на телефоне: те же авто-отступы на детях", () => {
    // Тот же механизм, что у wide-колонки: центрруют дети (margin-block),
    // не сам прокручиваемый контейнер.
    expect(narrow).toMatch(/\.player-bar\.open > \* \{[^}]*margin-block:\s*auto;[^}]*\}/);
    expect(narrow).not.toMatch(/\.player-bar\.open \{[^}]*justify-content:\s*center;[^}]*\}/);
  });

  it("кадр на странице плеера задаёт поля без шортката margin", () => {
    // Шорткат margin: 0 … перетёр бы центрирующий margin-block: auto.
    expect(narrow).toMatch(
      /\.player-bar\.open #video-stage \{[^}]*margin-inline:[^;]+;[^}]*\}/,
    );
    expect(narrow).not.toMatch(
      /\.player-bar\.open #video-stage \{[^}]\s*margin:\s*0[^;]*;/,
    );
  });
});

describe("каскад позиционирования меню категорий (issue #84)", () => {
  // #cat-menu несёт классы .quality-menu .cat-menu; специфичность обоих
  // правил одинаковая, поэтому побеждает позднее в файле.
  const at = (sel: string): number => css.indexOf(`${sel} {`);

  it(".cat-menu объявлен ПОСЛЕ .quality-menu — иначе bottom уцелеет", () => {
    const q = at(".quality-menu");
    const c = at(".cat-menu");
    expect(q).toBeGreaterThan(-1);
    expect(c).toBeGreaterThan(q);
  });

  it(".cat-menu сбрасывает нижнюю привязку .quality-menu", () => {
    const rule = css.slice(at(".cat-menu"), css.indexOf("}", at(".cat-menu")));
    expect(rule).toContain("top: calc(100% + 6px)");
    expect(rule).toContain("bottom: auto");
  });

  it(".quality-menu не задаёт top — иначе связка top+bottom схлопнет меню", () => {
    const rule = css.slice(at(".quality-menu"), css.indexOf("}", at(".quality-menu")));
    expect(rule).toContain("bottom: calc(100% + 6px)");
    expect(rule).not.toMatch(/\btop:/);
  });
});

describe("тема PWA совпадает с фоном", () => {
  const manifest = JSON.parse(
    readFileSync(root("public", "manifest.webmanifest"), "utf-8"),
  ) as { theme_color: string; background_color: string };

  it("manifest использует --bg тёмной темы", () => {
    expect(manifest.theme_color).toBe(DARK["--bg"]);
    expect(manifest.background_color).toBe(DARK["--bg"]);
  });

  it("meta theme-color в index.html — то же значение", () => {
    const html = readFileSync(root("index.html"), "utf-8");
    expect(html).toContain(`<meta name="theme-color" content="${DARK["--bg"]}" />`);
  });
});
