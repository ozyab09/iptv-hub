import { describe, expect, it } from "vitest";
import { classifyStorageChange } from "../src/cross-tab";
import { applyStorageChange } from "../src/cross-tab";

describe("classifyStorageChange", () => {
  it("ключ плейлистов/активного — перечитать плейлисты", () => {
    expect(classifyStorageChange("iptv-hub.playlists.v1")).toEqual({
      playlists: true,
      favorites: false,
      theme: false,
      ignore: false,
    });
    expect(classifyStorageChange("iptv-hub.active-playlist.v1").playlists).toBe(true);
  });

  it("любой ключ favorites — перечитать избранное", () => {
    const d = classifyStorageChange("iptv-hub.favorites.v1:12345");
    expect(d.favorites).toBe(true);
    expect(d.playlists).toBe(false);
    expect(classifyStorageChange("iptv-hub.favorites-order.v1:12345")).toEqual(d);
  });

  it("тема — перечитать тему", () => {
    expect(classifyStorageChange("iptv-hub.theme.v1").theme).toBe(true);
  });

  it("локальные ключи (recents, уведомления) игнорируются", () => {
    expect(classifyStorageChange("iptv-hub.recents.v1:1").ignore).toBe(true);
    expect(classifyStorageChange("iptv-hub.notifications.v1").ignore).toBe(true);
    expect(classifyStorageChange("iptv-hub.list-collapsed.v1").ignore).toBe(true);
  });

  it("clear() (key=null) — перечитать всё", () => {
    const d = classifyStorageChange(null);
    expect(d).toEqual({ playlists: true, favorites: true, theme: true, ignore: false });
  });
});

// #371: порядок и выбор реакций на storage-событие.
describe("applyStorageChange", () => {
  const keys = (id: string) => ({ groups: `g:${id}`, pins: `p:${id}`, favorites: `f:${id}`, favoritesOrder: `o:${id}` });
  const run = (key: string | null, active: string | null = "a") => {
    const out: string[] = [];
    applyStorageChange(key, () => (active ? keys(active) : null), (r) => out.push(r));
    return out;
  };

  it("clear() в другой вкладке — все реакции по порядку", () => {
    expect(run(null)).toEqual(["groups", "pins", "playlists", "favorites", "theme"]);
  });

  it("ключи групп и PIN активного плейлиста, чужой плейлист не задевает", () => {
    expect(run("g:a")).toEqual(["groups"]);
    expect(run("p:a")).toEqual(["pins"]);
    expect(run("g:b")).toEqual([]);
  });

  it("избранное реагирует только на ключи активного плейлиста", () => {
    const own = { groups: "g", pins: "p", favorites: "iptv-hub.favorites.v1:a", favoritesOrder: "iptv-hub.favorites-order.v1:a" };
    const out: string[] = [];
    applyStorageChange("iptv-hub.favorites.v1:a", () => own, (r) => out.push(r));
    applyStorageChange("iptv-hub.favorites-order.v1:a", () => own, (r) => out.push(r));
    applyStorageChange("iptv-hub.favorites.v1:b", () => own, (r) => out.push(r));
    expect(out).toEqual(["favorites", "favorites"]);
  });

  it("плейлисты и тема; служебные ключи игнорируются; без плейлиста — без групп и PIN", () => {
    expect(run("iptv-hub.playlists.v1")).toEqual(["playlists"]);
    expect(run("iptv-hub.theme.v1")).toEqual(["theme"]);
    expect(run("iptv-hub.recents.v1:a")).toEqual([]);
    expect(run(null, null)).toEqual(["playlists", "theme"]);
  });

  it("избранное проверяется по ключам плейлиста, активного после реакции playlists", () => {
    let active = "a";
    const out: string[] = [];
    applyStorageChange(null, () => ({ groups: `g:${active}`, pins: `p:${active}`, favorites: `f:${active}`, favoritesOrder: `o:${active}` }), (r) => {
      out.push(r);
      if (r === "playlists") active = "b";
    });
    expect(out).toEqual(["groups", "pins", "playlists", "favorites", "theme"]);
  });
});
