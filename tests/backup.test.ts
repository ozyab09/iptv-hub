import { describe, it, expect } from "vitest";
import {
  buildBackup,
  parseBackup,
  pushRecent,
  sanitizeRecents,
  sanitizeRecentList,
  recentsKey,
  RECENTS_MAX,
} from "../src/backup";

const valid = {
  version: 1,
  exportedAt: "2026-09-28T10:00:00.000Z",
  theme: "dark",
  playlists: [{ id: "a", name: "A", playlistUrl: "https://a/pl.m3u", epgUrl: null }],
  activeId: "a",
  favorites: { a: ["https://a/s1"] },
};

describe("buildBackup", () => {
  it("stamps version and date", () => {
    const b = buildBackup({
      theme: "light",
      playlists: valid.playlists,
      activeId: "a",
      favorites: {},
    });
    expect(b.version).toBe(1);
    expect(b.theme).toBe("light");
    expect(b.exportedAt).toBeTruthy();
  });
});

describe("parseBackup", () => {
  it("accepts a valid file", () => {
    const r = parseBackup(JSON.stringify(valid));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.playlists).toHaveLength(1);
  });

  it("rejects broken JSON", () => {
    expect(parseBackup("{oops").ok).toBe(false);
  });

  it("rejects wrong version", () => {
    expect(parseBackup(JSON.stringify({ ...valid, version: 2 })).ok).toBe(false);
  });

  it("rejects when no valid playlists", () => {
    const bad = { ...valid, playlists: [{ id: "x", name: "X", playlistUrl: "ftp://x", epgUrl: null }] };
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("валидного");
  });

  it("filters malformed favorites", () => {
    const r = parseBackup(
      JSON.stringify({ ...valid, favorites: { a: ["ok", 5, null, "also-ok"], b: "nope" } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.favorites["a"]).toEqual(["ok", "also-ok"]);
      expect(r.data.favorites["b"]).toBeUndefined();
    }
  });

  it("accepts a legacy file without recents", () => {
    const r = parseBackup(JSON.stringify(valid));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.recents).toBeUndefined();
  });

  it("parses and sanitizes recents per playlist", () => {
    const r = parseBackup(
      JSON.stringify({
        ...valid,
        recents: { a: ["u1", 5, "u2", "u1"], b: "nope", c: [] },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.recents).toEqual({ a: ["u1", "u2"] });
  });

  it("drops an all-empty recents map", () => {
    const r = parseBackup(JSON.stringify({ ...valid, recents: { c: [], d: 42 } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.recents).toBeUndefined();
  });
});

describe("buildBackup", () => {
  it("includes sanitized recents when given", () => {
    const b = buildBackup({
      theme: "dark",
      playlists: valid.playlists,
      activeId: "a",
      favorites: {},
      recents: { a: ["u1", "u2", "u1"] },
    });
    expect(b.recents).toEqual({ a: ["u1", "u2"] });
  });

  it("omits recents when empty or absent", () => {
    const base = {
      theme: "dark" as const,
      playlists: valid.playlists,
      activeId: "a",
      favorites: {},
    };
    expect(buildBackup(base).recents).toBeUndefined();
    expect(buildBackup({ ...base, recents: {} }).recents).toBeUndefined();
  });
});

describe("sanitizeRecents", () => {
  it("rejects non-objects and arrays", () => {
    expect(sanitizeRecents(null)).toBeNull();
    expect(sanitizeRecents(["u1"])).toBeNull();
    expect(sanitizeRecents("x")).toBeNull();
  });

  it("caps each list at RECENTS_MAX", () => {
    const long = Array.from({ length: RECENTS_MAX + 5 }, (_, i) => `u${i}`);
    const out = sanitizeRecents({ a: long });
    expect(out!["a"]).toHaveLength(RECENTS_MAX);
  });
});

describe("sanitizeRecentList", () => {
  it("keeps strings only, dedups, keeps order", () => {
    expect(sanitizeRecentList(["b", 1, "a", "b", null, "c"])).toEqual(["b", "a", "c"]);
    expect(sanitizeRecentList("nope")).toEqual([]);
  });
});

describe("recentsKey", () => {
  it("matches the localStorage key used by main", () => {
    expect(recentsKey("abc")).toBe("iptv-hub.recents.v1:abc");
  });
});

describe("pushRecent", () => {
  it("moves existing url to front (no dup)", () => {
    const out = pushRecent(["a", "b", "c"], "b");
    expect(out).toEqual(["b", "a", "c"]);
  });

  it("caps the list length", () => {
    let list: string[] = [];
    for (let i = 0; i < 15; i++) list = pushRecent(list, `u${i}`);
    expect(list).toHaveLength(RECENTS_MAX);
    expect(list[0]).toBe("u14");
  });
});
