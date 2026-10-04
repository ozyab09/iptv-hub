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
import { readBackupSections, restoreBackup } from "../src/backup-storage";
import { DEFAULT_PLAYER_SETTINGS } from "../src/player-settings";

const valid = {
  version: 1,
  exportedAt: "2026-09-28T10:00:00.000Z",
  theme: "dark",
  playlists: [{ id: "a", name: "A", playlistUrl: "https://a/pl.m3u", epgUrl: null }],
  activeId: "a",
  favorites: { a: ["https://a/s1"] },
};

const sections = {
  appSettings: { checkUpdates: false },
  channelOverrides: { a: [{ url: "https://a/s1", alias: "Alias", hidden: false }] },
  groupPreferences: { a: { hidden: ["Hidden"], order: ["Sports", "News"] } },
  parentalPins: { a: [{ group: "Locked", salt: "0".repeat(32), hash: "1".repeat(64) }] },
  channelHealth: { a: { version: 1 as const, failures: [{ url: "https://a/s1", failedAt: 123, kind: "http" as const, status: 503 }] } },
  favoritesOrder: { a: ["https://a/s1"] },
  playerSettings: { ...DEFAULT_PLAYER_SETTINGS, maxBufferLength: 60, volumePercent: 75 },
  language: "en" as const, refreshInterval: 360 as const,
  positions: { "https://a/movie.mp4": { t: 45, at: 123 } },
  recordingSchedule: { a: [{ id: "rec", playlistId: "a", channelUrl: "https://a/live.m3u8", channelName: "A", group: "News", title: "Film", start: 1_000, stop: 2_000, repeat: "daily" as const, revision: 1, lastStart: null, status: "scheduled" as const }] },
  reminders: { a: [{ channelUrl: "https://a/s1", channelName: "A", title: "Film", start: 1000, stop: 2000, leadMinutes: 5, notified: false }] },
  reminderSettings: { minutes: 10, desktop: false },
};

function storageKV() {
  const map = new Map<string, string>();
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
}

describe("backup v2", () => {
  it("uses playlist validation for v2, including local identity and optional EPG", () => {
    const result = parseBackup(JSON.stringify({ ...valid, version: 2, playlists: [
      { ...valid.playlists[0], epgUrl: "javascript:bad" },
      { id: "local", name: "File", playlistUrl: "local:old-timestamp", epgUrl: null },
    ] }));
    if (!result.ok) throw new Error(result.error);
    expect(result.data.playlists[0]!.epgUrl).toBeNull();
    expect(result.data.playlists[1]!.playlistUrl).toBe("local:local");
    expect(result.warnings).toContain("playlists");
  });
  it("round-trips every section through clean storage using the owning parsers", () => {
    const backup = buildBackup({ ...valid, ...sections, theme: "system" });
    const result = parseBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    const storage = storageKV();
    restoreBackup(storage, result.data);
    expect(readBackupSections(storage, ["a"])).toEqual(sections);
    expect(storage.getItem("iptv-hub.theme.v1")).toBe("system");
    expect(storage.getItem("iptv-hub.active-playlist.v1")).toBe("a");
    expect(JSON.parse(storage.getItem("iptv-hub.parental-pins.v1:a")!)[0]).toEqual(sections.parentalPins.a[0]);
  });
  it("drops malformed structures, repairs individual fields and reports section names", () => {
    const result = parseBackup(JSON.stringify({ ...valid, version: 2, channelOverrides: { a: [null, sections.channelOverrides.a[0]], unknown: [] },
      parentalPins: "bad", groupPreferences: { a: { hidden: ["Hidden", 123], order: ["News"] } },
      playerSettings: { ...sections.playerSettings, maxBufferLength: -1 }, language: "wrong", refreshInterval: 7,
      positions: { ...sections.positions, broken: null }, recordingSchedule: { a: [{ ...sections.recordingSchedule.a[0], playlistId: "unknown" }] } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.channelOverrides).toEqual(sections.channelOverrides);
    expect(result.data.parentalPins).toBeUndefined();
    expect(result.data.language).toBeUndefined();
    expect(result.data.refreshInterval).toBeUndefined();
    expect(result.data.playerSettings!.maxBufferLength).toBe(30);
    expect(result.data.positions).toEqual(sections.positions);
    expect(result.data.recordingSchedule).toEqual({ a: [] });
    expect(result.warnings).toEqual(expect.arrayContaining(["channelOverrides:a", "channelOverrides:unknown", "parentalPins", "language", "refreshInterval", "playerSettings", "positions", "recordingSchedule:a"]));
  });
  it("does not migrate a running recording, but retains its rule and deduplication marker", () => {
    const rule = { ...sections.recordingSchedule.a[0]!, status: "recording" as const, lastStart: 1000 };
    const backup = buildBackup({ ...valid, recordingSchedule: { a: [rule] } });
    expect(backup.recordingSchedule!.a).toEqual([{ ...rule, status: "missed" }]);
  });
  it("v1 keeps settings absent from its format and still restores its original data", () => {
    const result = parseBackup(JSON.stringify(valid));
    if (!result.ok) throw new Error(result.error);
    const storage = storageKV();
    storage.setItem("iptv-hub.language.v1", "en");
    storage.setItem("iptv-hub.parental-pins.v1:a", "existing");
    restoreBackup(storage, result.data);
    expect(storage.getItem("iptv-hub.language.v1")).toBe("en");
    expect(storage.getItem("iptv-hub.parental-pins.v1:a")).toBe("existing");
    expect(storage.getItem("iptv-hub.favorites.v1:a")).toBe(JSON.stringify(valid.favorites.a));
  });
  it("restores empty sections and leaves unrelated playlist keys intact", () => {
    const storage = storageKV();
    storage.setItem("iptv-hub.parental-pins.v1:a", "old");
    storage.setItem("iptv-hub.parental-pins.v1:other", "other");
    restoreBackup(storage, buildBackup({ ...valid, parentalPins: { a: [] }, favorites: {} }));
    expect(storage.getItem("iptv-hub.parental-pins.v1:a")).toBe("[]");
    expect(storage.getItem("iptv-hub.parental-pins.v1:other")).toBe("other");
    expect(storage.getItem("iptv-hub.favorites.v1:a")).toBe("[]");
  });
  it("rolls back touched keys after a failed write", () => {
    const storage = storageKV();
    storage.setItem("iptv-hub.playlists.v1", "old playlists");
    const snapshot = new Map(storage.map);
    expect(() => restoreBackup({ ...storage, setItem: (key, value) => {
      if (key === "iptv-hub.language.v1") throw new Error("Quota exceeded");
      storage.setItem(key, value);
    } }, buildBackup({ ...valid, ...sections }))).toThrow("Quota exceeded");
    expect(storage.map).toEqual(snapshot);
  });
});

describe("buildBackup", () => {
  it("stamps version and date", () => {
    const b = buildBackup({
      theme: "light",
      playlists: valid.playlists,
      activeId: "a",
      favorites: {},
    });
    expect(b.version).toBe(2);
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
    expect(parseBackup(JSON.stringify({ ...valid, version: 3 })).ok).toBe(false);
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
