import { describe, expect, it, vi } from "vitest";
import { parseXtreamCatalogue, parseXtreamEpisodes, resumeEpisode } from "../src/xtream-catalogue";
import { xtreamApiUrl } from "../src/xtream";
import { createTransport } from "../src/playlist-transport";
import { loadPlaylists, PLAYLISTS_KEY, updatePlaylist } from "../src/playlists";
import { buildBackup, parseBackup } from "../src/backup";
import { channelsForView } from "../src/views";
import type { Channel } from "../src/types";
import { SOURCE_TIMEOUT_MS } from "../src/source-timeout";

const source = { host: "https://fixture.test/panel", username: "u /", password: "p /" };
const categories = [{ category_id: "1", category_name: "Movies" }];
const movies = [{ stream_id: "10", name: "Movie", category_id: "1", container_extension: "mp4", stream_icon: "https://fixture.test/poster.png" }];
const series = parseXtreamCatalogue(source, "series", [{ series_id: "20", name: "Series", category_id: "1", cover: "https://fixture.test/series.png" }], categories)[0]!;
const episodes = { episodes: { "2": [{ id: "22", episode_num: 2, title: "Second", container_extension: "mp4" }], "1": [{ id: "21", episode_num: 1, title: "First", container_extension: "mp4" }] } };

describe("Xtream optional catalogue", () => {
  it("encodes media credentials and converts categories and HTTPS posters", () => {
    expect(parseXtreamCatalogue(source, "movie", movies, categories)[0]).toMatchObject({ name: "Movie", group: "Movies", mediaKind: "movie", logo: "https://fixture.test/poster.png", url: "https://fixture.test/panel/movie/u%20%2F/p%20%2F/10.mp4" });
    expect(series.url).toContain("action=get_series_info&series_id=20");
  });
  it("rejects injected IDs/extensions/URLs and drops HTTP posters", () => {
    expect(parseXtreamCatalogue(source, "movie", [{ ...movies[0], stream_id: "../x" }, { ...movies[0], container_extension: "../x" }, { ...movies[0], stream_url: "javascript:alert(1)" }], categories)).toEqual([]);
    expect(parseXtreamCatalogue(source, "movie", [{ ...movies[0], category_id: "unknown", stream_icon: "http://fixture.test/logo" }], categories)[0]).toMatchObject({ group: "Основные", logo: null });
    expect(parseXtreamCatalogue(source, "movie", [{ ...movies[0], stream_url: "https://fixture.test/direct.mp4" }], categories)[0]!.url).toBe("https://fixture.test/direct.mp4");
  });
  it("sorts episodes numerically and resumes the most recently watched episode", () => {
    const list = parseXtreamEpisodes(source, series, episodes);
    expect(list.map((entry) => entry.name)).toEqual(["First", "Second"]);
    expect(list[1]!.url).toBe("https://fixture.test/panel/series/u%20%2F/p%20%2F/22.mp4");
    expect(resumeEpisode(list, ["unknown", list[1]!.url, list[0]!.url])).toBe(list[1]);
    expect(resumeEpisode(list, [])).toBe(list[0]);
    expect(resumeEpisode([], [])).toBeNull();
    expect(() => parseXtreamEpisodes(source, series, {})).toThrow();
  });
  it("keeps live isolated and selects movies and series separately", () => {
    const movie = parseXtreamCatalogue(source, "movie", movies, categories)[0]!;
    const live: Channel = { ...movie, mediaKind: undefined, url: "https://fixture.test/live" };
    const entries = [live, movie, series];
    expect(channelsForView("channels", entries, new Set(), [])).toEqual([live]);
    expect(channelsForView("movies", entries, new Set(), [])).toEqual([movie]);
    expect(channelsForView("series", entries, new Set(), [])).toEqual([series]);
  });
  it("accepts flat episode arrays and preserves the explicit season", () => {
    expect(parseXtreamEpisodes(source, series, { episodes: [{ id: 23, title: "Third", season: 2, episode_num: 3 }] })[0]).toMatchObject({ season: 2, episode: 3, mediaKind: "episode" });
  });
  it("keeps HTTP status failures from catalogue requests", async () => {
    const transport = createTransport({ fs: () => null, language: () => "en", fetch: async (url) =>
      url.includes("get_vod_streams") ? new Response("", { status: 503 }) : new Response("[]") });
    await expect(transport.loadPlaylist(xtreamApiUrl(source, "get_live_streams"), true)).rejects.toThrow("503");
  });
  it.each(["catalogue", "episodes"])("aborts stalled %s requests at the shared deadline", async (kind) => {
    vi.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      const transport = createTransport({ fs: () => null, language: () => "en", fetch: async (url, init) => {
        signals.push(init!.signal!);
        return url.includes("get_live_") ? new Response("[]") : await new Promise<Response>(() => {});
      } });
      const url = xtreamApiUrl(source, "get_live_streams");
      const failed = expect(kind === "catalogue" ? transport.loadPlaylist(url, true) : transport.loadSeries(url, series)).rejects.toThrow(/45|timed out/i);
      await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);
      await failed;
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("queries only live by default, queries catalogue when enabled and loads episodes on demand", async () => {
    const fetch = vi.fn(async (url: string) => {
      const action = new URL(url).searchParams.get("action");
      const bodies: Record<string, unknown> = { get_live_streams: [], get_live_categories: [], get_vod_streams: movies, get_vod_categories: categories, get_series: [{ series_id: "20", name: "Series", category_id: "1" }], get_series_categories: categories, get_series_info: episodes };
      return new Response(JSON.stringify(bodies[action!]));
    });
    const transport = createTransport({ fs: () => null, fetch, language: () => "en" });
    const url = xtreamApiUrl(source, "get_live_streams");
    expect((await transport.loadPlaylist(url)).channels).toEqual([]);
    expect(fetch.mock.calls).toHaveLength(2);
    fetch.mockClear();
    expect((await transport.loadPlaylist(url, true)).channels).toHaveLength(2);
    expect(fetch.mock.calls).toHaveLength(6);
    const result = await transport.loadSeries(url, series);
    expect(result).toHaveLength(2);
    expect(fetch.mock.calls.at(-1)![0]).toBe(xtreamApiUrl(source, "get_series_info", "20"));
  });
  it("preserves the opt-in flag in storage, edits and backup without changing old playlists", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const playlist = { id: "one", name: "Xtream", playlistUrl: xtreamApiUrl(source, "get_live_streams"), epgUrl: null, xtreamVod: true };
    storage.setItem(PLAYLISTS_KEY, JSON.stringify([playlist]));
    expect(loadPlaylists(storage).items).toEqual([playlist]);
    expect(updatePlaylist(loadPlaylists(storage), "one", { xtreamVod: false }).items[0]!.xtreamVod).toBe(false);
    const backup = parseBackup(JSON.stringify(buildBackup({ playlists: [playlist], activeId: "one", favorites: {}, theme: "dark" })));
    expect(backup.ok && backup.data.playlists).toEqual([playlist]);
  });
});
