import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildId, stampVersion } from "../src/sw-version";

/**
 * Смоук-тесты PWA-артефактов: manifest валиден, иконки существуют,
 * service worker содержит все обработчики. Файлы читаются из public/
 * напрямую (без Vite) — тесты не зависят от сборки.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pub = (...p: string[]) => join(here, "..", "public", ...p);

describe("PWA manifest", () => {
  const manifest = JSON.parse(
    readFileSync(pub("manifest.webmanifest"), "utf-8"),
  ) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  it("принимает ссылки и файлы плейлистов извне относительными путями (#373)", () => {
    const extra = manifest as unknown as {
      share_target: { action: string; method: string; params: Record<string, string> };
      file_handlers: { action: string; accept: Record<string, string[]> }[];
    };
    expect(extra.share_target).toEqual({ action: "./", method: "GET", params: { title: "title", text: "text", url: "url" } });
    expect(extra.file_handlers.map((h) => h.action)).toEqual(["./"]);
    expect(Object.values(extra.file_handlers[0]!.accept).flat()).toContain(".m3u");
  });

  it("has required fields", () => {
    expect(manifest.name).toBe("IPTV Hub");
    expect(manifest.start_url).toBe("./"); // относительный путь — обязателен для Pages-поддомена
    expect(manifest.display).toBe("standalone");
  });

  it("declares 192 and 512 icons that exist on disk", () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);

    for (const icon of manifest.icons) {
      const file = pub("icons", icon.src.replace("./icons/", ""));
      expect(existsSync(file), `${icon.src} отсутствует`).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(100); // не пустой файл
    }
  });

  it("icons are real PNGs (magic bytes)", () => {
    for (const file of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
      const buf = readFileSync(pub("icons", file));
      expect([...buf.subarray(0, 8)]).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
    }
  });
});

describe("service worker", () => {
  const sw = readFileSync(pub("sw.js"), "utf-8");

  it("registers all lifecycle handlers", () => {
    expect(sw).toContain('addEventListener("install"');
    expect(sw).toContain('addEventListener("activate"');
    expect(sw).toContain('addEventListener("fetch"');
  });

  it("never caches media segments", () => {
    expect(sw).toContain(".ts");
    expect(sw).toContain("range"); // range-запросы мимо кэша
  });

  it("caches playlist/EPG as network-first with offline fallback", () => {
    expect(sw).toContain("networkFirstData");
    expect(sw).toContain("DATA_CACHE");
  });

  it("uses versioned cache names for invalidation", () => {
    expect(sw).toMatch(/VERSION\s*=\s*"v\d+\.\d+\.\d+"/);
  });
});

describe("обновление без смеси старого и нового", () => {
  const sw = readFileSync(pub("sw.js"), "utf-8");
  const mainTs = readFileSync(join(here, "..", "src", "main.ts"), "utf-8");

  it("страница открывается мимо HTTP-кэша", () => {
    expect(sw).toMatch(/networkFirstNavigation[\s\S]*cache:\s*"no-cache"/);
  });

  it("версия SW собирается из версии приложения и хэша сборки", () => {
    const stamped = stampVersion('const VERSION = "v0.2.5";\nrest', "<html>a</html>", "0.2.7");
    expect(stamped).toMatch(/^const VERSION = "v0\.2\.7\+[0-9a-f]{10}";\nrest$/);
    // другая сборка — другая версия, та же — та же
    expect(stampVersion('const VERSION = "v0.2.5";', "<html>b</html>", "0.2.7")).not.toBe(
      stampVersion('const VERSION = "v0.2.5";', "<html>a</html>", "0.2.7"),
    );
    expect(buildId("x")).toBe(buildId("x"));
    // повторная простановка не копит хэши
    expect(stampVersion(stamped, "<html>c</html>", "0.2.7")).toMatch(/^const VERSION = "v0\.2\.7\+[0-9a-f]{10}";/);
    // версия приходит извне (тег в CI), а не из константы файла
    expect(stampVersion('const VERSION = "v0.0.1";', "<html>a</html>", "9.9.9")).toContain('"v9.9.9+');
  });

  it("без строки VERSION сборка падает, а не молча ставит старый кэш", () => {
    expect(() => stampVersion("const X = 1;", "", "0.2.7")).toThrow();
  });

  it("новая версия перезагружает страницу или предлагает обновиться", () => {
    expect(mainTs).toContain('addEventListener("controllerchange"');
    expect(mainTs).toContain("reg.update()");
  });
});
