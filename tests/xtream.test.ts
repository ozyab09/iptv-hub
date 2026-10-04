import { describe, expect, it, vi } from "vitest";
import { validateXtream, readXtreamUrl, xtreamApiUrl, xtreamEpgUrl, parseXtream } from "../src/xtream";
import { createTransport } from "../src/playlist-transport";
import { buildCatchupUrl, canWatchPast } from "../src/catchup";
import { loadPlaylists, savePlaylists, upsertByUrl } from "../src/playlists";
import { buildBackup, parseBackup } from "../src/backup";

const source = { host: "https://provider.test/panel", username: "user /&?", password: "pass /&?" };
const categories = [{ category_id: "5", category_name: "News" }];
const streams = [{ stream_id: 42, name: "News HD", stream_type: "live", category_id: "5", epg_channel_id: "news.epg", stream_icon: "https://provider.test/logo.png", tv_archive: 1, tv_archive_duration: "7" }];

describe("Xtream", () => {
  it.each(["99", undefined])("uses the default group for unknown category_id=%s", (category_id) => {
    const snapshot = parseXtream(source, [{ ...streams[0], category_id }], categories);
    expect(snapshot.channels[0]!.group).toBe("Основные");
    expect(snapshot.categories).toEqual(["Основные"]);
  });
  it("uses the default group for an empty category name", () => {
    expect(parseXtream(source, streams, [{ category_id: "5", category_name: "" }]).categories).toEqual(["Основные"]);
  });
  it.each([1, 2, 99, 0, "live", undefined])("accepts live API stream_type=%s", (stream_type) => {
    const snapshot = parseXtream(source, [{ ...streams[0], stream_type }], categories);
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.channels[0]).toMatchObject({ name: "News HD", group: "News", tvgId: "news.epg", catchupDays: 3 });
  });
  it.each(["movie", "vod", "series", "recorded", true])("rejects explicit non-live stream_type=%s", (stream_type) => {
    expect(parseXtream(source, [{ ...streams[0], stream_type }], categories).channels).toEqual([]);
  });
  it.each(["http://provider.test", "javascript:alert(1)", "https://u:p@provider.test", "https://provider.test?password=x", "https://provider.test/#hash", "invalid"])("rejects invalid host %s", (host) => {
    expect(validateXtream({ ...source, host })).toBeNull();
  });
  it.each(["", ".", ".."]) ("rejects invalid credentials %s", (value) => {
    expect(validateXtream({ ...source, username: value })).toBeNull();
    expect(validateXtream({ ...source, password: value })).toBeNull();
  });
  it("normalizes host and round-trips encoded credentials, preserving path and HTTPS port", () => {
    const valid = validateXtream({ ...source, host: " https://provider.test:8443/panel/ " })!;
    expect(valid.host).toBe("https://provider.test:8443/panel");
    expect(readXtreamUrl(xtreamApiUrl(valid, "get_live_streams"))).toEqual(valid);
    expect(new URL(xtreamEpgUrl(valid)).searchParams.get("password")).toBe(source.password);
    expect(readXtreamUrl("https://provider.test/playlist.m3u")).toBeNull();
    expect(readXtreamUrl("https://provider.test/player_api.php?action=get_live_streams")).toBeNull();
  });
  it("maps live streams to the common parser, EPG, logos, categories and bounded catchup", () => {
    const snapshot = parseXtream(source, [...streams, ...streams, { stream_id: "../bad", name: "bad" }, { stream_id: 1, name: "Movie", stream_type: "movie" }, null], categories);
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.categories).toEqual(["News"]);
    expect(snapshot.headerTvgUrl).toBe(xtreamEpgUrl(source));
    expect(snapshot.channels[0]).toMatchObject({ tvgId: "news.epg", quality: "HD", group: "News", catchupDays: 3, logo: "https://provider.test/logo.png" });
    expect(snapshot.channels[0]!.url).toBe("https://provider.test/panel/live/user%20%2F%26%3F/pass%20%2F%26%3F/42.m3u8");
    const programme = { start: "2026-10-02T10:05:00+03:00", stop: "2026-10-02T10:35:01+03:00", title: "Past", desc: null };
    const info = { days: snapshot.channels[0]!.catchupDays, source: snapshot.channels[0]!.catchupSource };
    expect(canWatchPast(info, programme, new Date("2026-10-02T12:00:00Z"))).toBe(true);
    expect(buildCatchupUrl(info, programme)).toBe("https://provider.test/panel/timeshift/user%20%2F%26%3F/pass%20%2F%26%3F/31/2026-10-02:07-05/42.m3u8");
  });
  it("does not allow M3U injection or HTTP logos and ignores archive duration when disabled", () => {
    const snapshot = parseXtream(source, [{ ...streams[0], name: '"Title"\nhttps://evil.test', epg_channel_id: 'x" group-title="Injected', stream_icon: "http://provider.test/logo.png", tv_archive: 0 }], categories);
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.channels[0]).toMatchObject({ name: '"Title" https://evil.test', group: "News", logo: null, catchupDays: 0, catchupSource: null });
  });
  it("handles empty live lists and rejects authentication objects and malformed lists", () => {
    expect(parseXtream(source, [], []).channels).toEqual([]);
    expect(() => parseXtream(source, { user_info: { auth: 0 } }, categories)).toThrow();
    expect(() => parseXtream(source, streams, null)).toThrow();
  });
  it("loads both APIs using injected fetch and does not request get.php", async () => {
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(new URL(url).searchParams.get("action") === "get_live_streams" ? streams : categories)));
    const transport = createTransport({ fs: () => null, fetch, language: () => "en" });
    expect((await transport.loadPlaylist(xtreamApiUrl(source, "get_live_streams"))).channels).toHaveLength(1);
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("action")).sort()).toEqual(["get_live_categories", "get_live_streams"]);
  });
  it.each([new Response("denied", { status: 401 }), new Response("not json"), new Response('{"user_info":{"auth":0}}')])("reports failed API responses without exposing credentials", async (response) => {
    const transport = createTransport({ fs: () => null, fetch: async () => response.clone(), language: () => "en" });
    await expect(transport.loadPlaylist(xtreamApiUrl(source, "get_live_streams"))).rejects.toThrow(/HTTP 401|invalid API response/);
  });
  it("preserves Xtream through storage/backup and coexists with URL upsert", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
    const state = { items: [{ id: "xc", name: "Xtream", playlistUrl: xtreamApiUrl(source, "get_live_streams"), epgUrl: xtreamEpgUrl(source) }], activeId: "xc" };
    savePlaylists(storage, state);
    expect(loadPlaylists(storage)).toEqual(state);
    const backup = parseBackup(JSON.stringify(buildBackup({ ...state, playlists: state.items, theme: "dark", favorites: {} })));
    expect(backup.ok && backup.data.playlists).toEqual(state.items);
    expect(upsertByUrl(state, "https://other.test/list.m3u", null).items).toHaveLength(2);
  });
});
