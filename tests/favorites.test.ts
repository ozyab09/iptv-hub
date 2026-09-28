import { describe, it, expect } from "vitest";
import {
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  isFavorite,
  applyFavorites,
  exportFavorites,
} from "../src/favorites";
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
});
