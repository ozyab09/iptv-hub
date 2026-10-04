import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playlistScopedKey } from "../src/playlist-scoped-key";
import { recentsKey } from "../src/backup";
import { channelHealthKey } from "../src/channel-health";
import { channelOverridesKey } from "../src/channel-overrides";
import { subtitlePreferenceKey } from "../src/external-subtitles";
import { favoritesOrderKey } from "../src/favorites-order";
import { groupPreferencesKey } from "../src/group-preferences";
import { parentalPinsKey } from "../src/parental-pin";
import { favoritesKey } from "../src/playlists";
import { remindersKey } from "../src/reminder";

// #374: ключи — контракт localStorage и backup JSON v2, строки не меняются.
describe("playlistScopedKey", () => {
  it("шаблон iptv-hub.<name>.v1:<id>", () => {
    expect(playlistScopedKey("favorites", "abc")).toBe("iptv-hub.favorites.v1:abc");
  });

  it("все потребители дают прежние строки ключей", () => {
    const id = "pl-1";
    expect([
      favoritesKey(id), recentsKey(id), favoritesOrderKey(id), groupPreferencesKey(id), channelOverridesKey(id),
      parentalPinsKey(id), channelHealthKey(id), remindersKey(id), subtitlePreferenceKey(id),
    ]).toEqual([
      "iptv-hub.favorites.v1:pl-1", "iptv-hub.recents.v1:pl-1", "iptv-hub.favorites-order.v1:pl-1",
      "iptv-hub.groups.v1:pl-1", "iptv-hub.channel-overrides.v1:pl-1", "iptv-hub.parental-pins.v1:pl-1",
      "iptv-hub.channel-health.v1:pl-1", "iptv-hub.reminders.v1:pl-1", "iptv-hub.recording-subtitles.v1:pl-1",
    ]);
  });

  it("шаблон ключа плейлиста больше нигде не собирается вручную", () => {
    const offenders = readdirSync("src")
      .filter((file) => file.endsWith(".ts") && file !== "playlist-scoped-key.ts")
      .filter((file) => /`iptv-hub\.[a-z-]+\.v1:\$\{/.test(readFileSync(`src/${file}`, "utf8")));
    expect(offenders).toEqual([]);
  });
});
