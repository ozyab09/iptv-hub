import { describe, expect, it } from "vitest";
import { classifyStorageChange } from "../src/cross-tab";

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
