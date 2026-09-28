import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
