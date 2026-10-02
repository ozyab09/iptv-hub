import { describe, it, expect } from "vitest";
import {
  loadPlaylists,
  savePlaylists,
  addPlaylist,
  addLocalPlaylist,
  updatePlaylist,
  removePlaylist,
  activePlaylist,
  upsertByUrl,
  favoritesKey,
  PLAYLISTS_KEY,
  LEGACY_CONFIG_KEY,
  LEGACY_FAVORITES_KEY,
  type PlaylistsState,
} from "../src/playlists";

const store = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

const empty: PlaylistsState = { items: [], activeId: null };

describe("local playlists", () => {
  it("uses one ID for import, persistence and legacy recovery", () => {
    const s = store();
    const imported = addLocalPlaylist(empty, "Local");
    const pl = imported.items[0]!;
    expect(pl.playlistUrl).toBe(`local:${pl.id}`);
    savePlaylists(s, imported);
    expect(loadPlaylists(s)).toEqual(imported);
    s.setItem(PLAYLISTS_KEY, JSON.stringify([{ ...pl, playlistUrl: "local:123456" }]));
    expect(loadPlaylists(s)).toEqual(imported);
  });

  it("rejects malformed local markers and unsafe protocols", () => {
    const s = store();
    const urls = ["local:", "local:../file", "local://host/file", "javascript:alert(1)", "file:///a", "data:text/plain,a"];
    s.setItem(PLAYLISTS_KEY, JSON.stringify(urls.map((playlistUrl) => ({ id: "abc", name: "Bad", playlistUrl }))));
    expect(loadPlaylists(s).items).toEqual([]);
  });
});

describe("loadPlaylists / migrateLegacy", () => {
  it("migrates the legacy single config into the first playlist", () => {
    const s = store();
    s.setItem(
      LEGACY_CONFIG_KEY,
      JSON.stringify({ playlistUrl: "https://a/pl.m3u", epgUrl: "https://a/epg.gz" }),
    );
    const st = loadPlaylists(s as Storage);
    expect(st.items).toHaveLength(1);
    expect(st.items[0]!.name).toBe("Основной");
    expect(st.items[0]!.playlistUrl).toBe("https://a/pl.m3u");
    expect(st.activeId).toBe(st.items[0]!.id);
  });

  it("migration is idempotent and keeps existing list", () => {
    const s = store();
    s.setItem(
      PLAYLISTS_KEY,
      JSON.stringify([{ id: "x", name: "N", playlistUrl: "https://x/pl.m3u", epgUrl: null }]),
    );
    s.setItem(
      LEGACY_CONFIG_KEY,
      JSON.stringify({ playlistUrl: "https://legacy/pl.m3u", epgUrl: null }),
    );
    const st = loadPlaylists(s as Storage);
    expect(st.items).toHaveLength(1);
    expect(st.items[0]!.id).toBe("x");
  });

  it("ignores broken legacy data", () => {
    const s = store();
    s.setItem(LEGACY_CONFIG_KEY, "{oops");
    expect(loadPlaylists(s as Storage).items).toEqual([]);
  });

  it("migrates legacy global favorites to the first playlist (#111)", () => {
    const s = store();
    s.setItem(
      LEGACY_CONFIG_KEY,
      JSON.stringify({ playlistUrl: "https://a/pl.m3u", epgUrl: null }),
    );
    s.setItem(
      LEGACY_FAVORITES_KEY,
      JSON.stringify(["https://a/s1", "https://a/s2"]),
    );
    const st = loadPlaylists(s as Storage);
    const first = st.items[0]!;
    expect(JSON.parse(s.getItem(favoritesKey(first.id)) ?? "[]")).toEqual([
      "https://a/s1",
      "https://a/s2",
    ]);
    // легаси-ключ не удаляется (обратная совместимость)
    expect(s.getItem(LEGACY_FAVORITES_KEY)).not.toBeNull();
  });

  it("migrates legacy favorites when the list already exists", () => {
    const s = store();
    s.setItem(
      PLAYLISTS_KEY,
      JSON.stringify([{ id: "x", name: "N", playlistUrl: "https://x/pl.m3u", epgUrl: null }]),
    );
    s.setItem(LEGACY_FAVORITES_KEY, JSON.stringify(["https://x/s1", 42, null]));
    loadPlaylists(s as Storage);
    expect(JSON.parse(s.getItem(favoritesKey("x")) ?? "[]")).toEqual(["https://x/s1"]);
  });

  it("never overwrites existing per-playlist favorites (idempotent)", () => {
    const s = store();
    s.setItem(
      PLAYLISTS_KEY,
      JSON.stringify([{ id: "x", name: "N", playlistUrl: "https://x/pl.m3u", epgUrl: null }]),
    );
    s.setItem(favoritesKey("x"), JSON.stringify(["https://mine/s1"]));
    s.setItem(LEGACY_FAVORITES_KEY, JSON.stringify(["https://legacy/s1"]));
    loadPlaylists(s as Storage);
    loadPlaylists(s as Storage); // повторный вызов тоже ничего не меняет
    expect(JSON.parse(s.getItem(favoritesKey("x")) ?? "[]")).toEqual(["https://mine/s1"]);
  });

  it("ignores empty or malformed legacy favorites", () => {
    const s = store();
    s.setItem(
      PLAYLISTS_KEY,
      JSON.stringify([{ id: "x", name: "N", playlistUrl: "https://x/pl.m3u", epgUrl: null }]),
    );
    s.setItem(LEGACY_FAVORITES_KEY, JSON.stringify(["", 42]));
    loadPlaylists(s as Storage);
    expect(s.getItem(favoritesKey("x"))).toBeNull();

    const s2 = store();
    s2.setItem(
      PLAYLISTS_KEY,
      JSON.stringify([{ id: "y", name: "N", playlistUrl: "https://y/pl.m3u", epgUrl: null }]),
    );
    s2.setItem(LEGACY_FAVORITES_KEY, "not json");
    expect(() => loadPlaylists(s2 as Storage)).not.toThrow();
    expect(s2.getItem(favoritesKey("y"))).toBeNull();
  });
});

describe("add / update / remove", () => {
  it("adds and activates the first playlist", () => {
    const st = addPlaylist(empty, "Мой", "https://a/pl.m3u", null);
    expect(st.items).toHaveLength(1);
    expect(st.activeId).toBe(st.items[0]!.id);
  });

  it("adds a second playlist keeping the active one", () => {
    let st = addPlaylist(empty, "A", "https://a/pl.m3u", null);
    const first = st.activeId;
    st = addPlaylist(st, "B", "https://b/pl.m3u", null);
    expect(st.items).toHaveLength(2);
    expect(st.activeId).toBe(first);
  });

  it("updates name and urls by id", () => {
    let st = addPlaylist(empty, "A", "https://a/pl.m3u", null);
    const id = st.items[0]!.id;
    st = updatePlaylist(st, id, { name: "Новое", playlistUrl: "https://n/pl.m3u" });
    expect(st.items[0]!.name).toBe("Новое");
    expect(st.items[0]!.playlistUrl).toBe("https://n/pl.m3u");
  });

  it("remove reassigns active to the first remaining", () => {
    let st = addPlaylist(empty, "A", "https://a/pl.m3u", null);
    st = addPlaylist(st, "B", "https://b/pl.m3u", null);
    const a = st.items[0]!.id;
    st = removePlaylist(st, a);
    expect(st.items).toHaveLength(1);
    expect(st.activeId).toBe(st.items[0]!.id);
  });

  it("round-trips through storage", () => {
    const s = store();
    let st = addPlaylist(empty, "A", "https://a/pl.m3u", null);
    savePlaylists(s as Storage, st);
    const loaded = loadPlaylists(s as Storage);
    expect(loaded.items[0]!.name).toBe("A");
    expect(loaded.activeId).toBe(st.activeId);
  });
});

describe("upsertByUrl", () => {
  it("activates an existing playlist with the same URL", () => {
    let st = addPlaylist(empty, "A", "https://a/pl.m3u", null);
    st = addPlaylist(st, "B", "https://b/pl.m3u", null);
    st = upsertByUrl(st, "https://a/pl.m3u", null);
    expect(activePlaylist(st)!.name).toBe("A");
  });

  it("adds a new one when the URL is unseen", () => {
    let st = addPlaylist(empty, "A", "https://a/pl.m3u", null);
    st = upsertByUrl(st, "https://new/pl.m3u", "https://new/epg.gz");
    expect(st.items).toHaveLength(2);
    expect(activePlaylist(st)!.playlistUrl).toBe("https://new/pl.m3u");
    expect(activePlaylist(st)!.epgUrl).toBe("https://new/epg.gz");
  });

  // Регрессия #71: ссылка ?p=на существующий + ?e= должна обновить EPG, а не
  // просто активировать плейлист со старой телепрограммой.
  it("updates EPG when an existing playlist is opened with a new e= link (#71)", () => {
    let st = addPlaylist(empty, "A", "https://a/pl.m3u", "https://old/epg.gz");
    const id = st.items[0]!.id;
    st = upsertByUrl(st, "https://a/pl.m3u", "https://new/epg.gz");
    expect(st.activeId).toBe(id);
    expect(st.items).toHaveLength(1);
    expect(st.items[0]!.epgUrl).toBe("https://new/epg.gz");
  });

  it("keeps the old EPG when the same link has no e=", () => {
    let st = addPlaylist(empty, "A", "https://a/pl.m3u", "https://old/epg.gz");
    st = upsertByUrl(st, "https://a/pl.m3u", null);
    expect(st.items[0]!.epgUrl).toBe("https://old/epg.gz");
  });
});

describe("favoritesKey", () => {
  it("is namespaced per playlist", () => {
    expect(favoritesKey("abc")).toBe("iptv-hub.favorites.v1:abc");
  });
});
