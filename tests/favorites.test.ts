import { describe, it, expect } from "vitest";
import {
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  isFavorite,
  applyFavorites,
  exportFavorites,
  buildFavoritesM3U,
} from "../src/favorites";
import { parseM3U } from "../src/m3u";
import { buildCatchupUrl } from "../src/catchup";
import type { Channel } from "../src/types";

const store = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
};

const ch = (url: string, name = url): Channel => ({
  name,
  normalizedName: name.toLowerCase(),
  url,
  tvgId: null,
  logo: null,
  group: "Основные",
  quality: null,
  catchupDays: 0,
  catchupSource: null,
});

const A = ch("https://a/stream");
const B = ch("https://b/stream");
const C = ch("https://c/stream");

describe("favorites", () => {
  it("round-trips through storage", () => {
    const s = store();
    let favs = toggleFavorite(new Set<string>(), A);
    favs = toggleFavorite(favs, B);
    saveFavorites(s, favs);
    const loaded = loadFavorites(s);
    expect(loaded.size).toBe(2);
    expect(isFavorite(loaded, A)).toBe(true);
    expect(isFavorite(loaded, B)).toBe(true);
  });

  it("toggle adds then removes", () => {
    let favs = toggleFavorite(new Set<string>(), A);
    expect(isFavorite(favs, A)).toBe(true);
    favs = toggleFavorite(favs, A);
    expect(isFavorite(favs, A)).toBe(false);
  });

  it("treats broken storage as empty", () => {
    const s = store();
    s.setItem("iptv-hub.favorites.v1", "{not json");
    expect(loadFavorites(s).size).toBe(0);
    s.setItem("iptv-hub.favorites.v1", JSON.stringify("not-an-array"));
    expect(loadFavorites(s).size).toBe(0);
    s.setItem("iptv-hub.favorites.v1", JSON.stringify([1, "ok", null]));
    const favs = loadFavorites(s);
    expect([...favs]).toEqual(["ok"]);
  });

  it("filter=true keeps only favorites", () => {
    const favs = new Set([B.url]);
    const out = applyFavorites([A, B, C], favs, true);
    expect(out).toEqual([B]);
  });

  it("filter=false sorts favorites first, keeps order inside groups", () => {
    const favs = new Set([C.url]);
    const out = applyFavorites([A, B, C], favs, false);
    expect(out.map((c) => c.url)).toEqual([C.url, A.url, B.url]);
  });

  it("export produces stable JSON", () => {
    const favs = new Set([A.url]);
    expect(exportFavorites(favs)).toBe(
      JSON.stringify([A.url], null, 2),
    );
  });

  it("buildFavoritesM3U: round-trip через parseM3U без потерь", () => {
    const favs = new Set([A.url, C.url]);
    const m3u = buildFavoritesM3U([A, B, C], favs);
    expect(m3u.startsWith("#EXTM3U")).toBe(true);
    const parsed = parseM3U(m3u);
    expect(parsed.channels.map((c) => c.url)).toEqual([A.url, C.url]);
    expect(parsed.channels[0]!.name).toBe(A.name);
    // парсер нормализует пустые атрибуты в "": проверяем группу, она задана
    expect(parsed.channels[0]!.group).toBe(A.group);
  });

  it("buildFavoritesM3U: архив, зеркала и метаданные переживают round-trip (#354)", () => {
    const rich: Channel = {
      ...ch("https://cdn/live.m3u8", "Спорт HD"),
      tvgId: "sport.ru",
      logo: "https://cdn/logo.png",
      group: "Спорт",
      quality: "HD",
      catchupDays: 3,
      catchupSource: "https://cdn/archive.m3u8?utc={utc}&lutc={lutc}",
      mirrors: ["https://mirror/live.m3u8"],
    };
    const parsed = parseM3U(buildFavoritesM3U([rich], new Set([rich.url]))).channels[0]!;
    expect(parsed).toMatchObject({
      url: rich.url,
      name: rich.name,
      tvgId: rich.tvgId,
      logo: rich.logo,
      group: rich.group,
      catchupDays: 3,
      catchupSource: rich.catchupSource,
      mirrors: rich.mirrors,
    });
    // архив импортированного канала доступен: URL прошедшей передачи строится
    const start = new Date(Date.now() - 2 * 3600_000).toISOString();
    const stop = new Date(Date.now() - 3600_000).toISOString();
    expect(buildCatchupUrl({ days: parsed.catchupDays, source: parsed.catchupSource }, { start, stop, title: "Матч", desc: null })).toContain("utc=");
  });

  it("buildFavoritesM3U: пустые атрибуты не пишутся", () => {
    const bare = { ...ch("https://bare/stream", "Bare"), group: "" };
    const m3u = buildFavoritesM3U([bare], new Set([bare.url]));
    expect(m3u).toBe("#EXTM3U\n#EXTINF:-1,Bare\nhttps://bare/stream\n");
    expect(m3u).not.toMatch(/=""/);
  });

  it("buildFavoritesM3U: без избранного — заголовок и ничего больше", () => {
    const m3u = buildFavoritesM3U([A, B], new Set());
    expect(m3u.trim()).toBe("#EXTM3U");
  });
});
