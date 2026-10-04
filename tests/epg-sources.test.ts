import { afterEach, describe, expect, it, vi } from "vitest";
import { epgSourceUrls, epgSourcesInput, mergeEpgSources, parseEpgSources } from "../src/epg-sources";
import { getNowNext, loadEpgSources } from "../src/epg";
import { applyChannelOverrides, parseChannelOverrides, serializeChannelOverrides, setChannelOverride } from "../src/channel-overrides";
import { loadPlaylists, PLAYLISTS_KEY } from "../src/playlists";
import { buildBackup, parseBackup } from "../src/backup";
import { parseM3U } from "../src/m3u";
import { searchProgrammes } from "../src/programme-search";
import type { EpgProgramme } from "../src/types";

afterEach(() => vi.unstubAllGlobals());
const programme: EpgProgramme = { start: "2026-10-04T10:00:00Z", stop: "2026-10-04T11:00:00Z", title: "First", desc: "" };
const snapshot = parseM3U('#EXTM3U\n#EXTINF:-1 tvg-id="wrong",Channel\nhttps://fixture.test/live.mp4');

describe("custom EPG sources", () => {
  it("validates URLs, limits storage to three and rejects malformed form input", () => {
    expect(parseEpgSources([" https://one.test/epg ", "javascript:x", "https://one.test/epg", "https://two.test/epg", "https://three.test/epg", "https://four.test/epg"])).toEqual(["https://one.test/epg", "https://two.test/epg", "https://three.test/epg"]);
    expect(parseEpgSources(null)).toEqual([]);
    expect(epgSourcesInput("https://one.test/epg\nhttps://two.test/epg")).toHaveLength(2);
    expect(epgSourcesInput("")).toEqual([]);
    expect(epgSourcesInput("https://one.test/epg javascript:x")).toBeNull();
    expect(epgSourcesInput("https://1.test https://2.test https://3.test https://4.test")).toBeNull();
  });
  it("keeps primary/additional/header priority and eliminates repeated requests", () => {
    expect(epgSourceUrls("https://one.test/epg", ["https://two.test/epg", "https://one.test/epg"], "https://three.test/epg")).toEqual(["https://one.test/epg", "https://two.test/epg", "https://three.test/epg"]);
    expect(epgSourceUrls(null, [], null)).toEqual([]);
  });
  it("fills missing/empty keys from later sources while keeping first nonempty conflicts", () => {
    const first = new Map([["id:one", [programme]], ["id:empty", []]]);
    const second = new Map([["id:one", [{ ...programme, title: "Second" }]], ["id:two", [programme]], ["id:empty", [programme]]]);
    expect([...mergeEpgSources([first, second])]).toEqual([["id:one", [programme]], ["id:two", [programme]], ["id:empty", [programme]]]);
    expect(first.get("id:empty")).toEqual([]);
  });
  it("fetches in parallel, merges in source order and retains successes after an HTTP failure", async () => {
    let release!: (response: Response) => void;
    const fetch = vi.fn(async (url: string) => {
      if (url === "primary") return await new Promise<Response>((resolve) => { release = resolve; });
      if (url === "failed") return new Response("", { status: 503 });
      return new Response('<tv><programme channel="one" start="20261004100000 +0000" stop="20261004110000 +0000"><title>Second</title></programme><programme channel="two" start="20261004100000 +0000" stop="20261004110000 +0000"><title>Only second</title></programme></tv>');
    });
    vi.stubGlobal("fetch", fetch);
    const progress = vi.fn();
    const pending = loadEpgSources(["primary", "second", "failed"], progress);
    expect(fetch).toHaveBeenCalledTimes(3);
    release(new Response('<tv><programme channel="one" start="20261004100000 +0000" stop="20261004110000 +0000"><title>First</title></programme></tv>'));
    const result = await pending;
    expect(result.get("id:one")![0]!.title).toBe("First");
    expect(result.get("id:two")![0]!.title).toBe("Only second");
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });
  it("reports failure only when every source failed", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    await expect(loadEpgSources(["one", "two"])).rejects.toThrow("EPG sources unavailable");
    await expect(loadEpgSources([])).resolves.toEqual(new Map());
  });
  it("uses a manual ID for now/next and programme search without changing source channels", () => {
    const overrides = setChannelOverride(new Map(), snapshot.channels[0]!.url, "Alias", false, " Right ");
    const channel = applyChannelOverrides(snapshot.channels, overrides)[0]!;
    const epg = new Map([["id:right", [programme]]]);
    expect(getNowNext(epg, channel, snapshot, new Date("2026-10-04T10:30:00Z")).now?.title).toBe("First");
    expect(searchProgrammes([channel], epg, "First")).toHaveLength(1);
    expect(snapshot.channels[0]!.tvgId).toBe("wrong");
    expect(channel.normalizedName).toBe(snapshot.channels[0]!.normalizedName);
    expect(parseChannelOverrides(serializeChannelOverrides(overrides))).toEqual(overrides);
    expect(setChannelOverride(overrides, channel.url, "Alias", false).get(channel.url)?.epgId).toBe("Right");
    expect(setChannelOverride(overrides, channel.url, "", false, "").size).toBe(0);
  });
  it("round trips sources and ID-only mappings through storage and validated backup v2", () => {
    const playlist = { id: "one", name: "TV", playlistUrl: "https://fixture.test/list.m3u", epgUrl: null, additionalEpgUrls: ["https://fixture.test/extra.xml"] };
    const overrides = [{ url: snapshot.channels[0]!.url, alias: "", hidden: false, epgId: "right" }];
    expect(loadPlaylists({ getItem: (key) => key === PLAYLISTS_KEY ? JSON.stringify([playlist]) : null, setItem: () => {}, removeItem: () => {} }).items).toEqual([playlist]);
    const backup = buildBackup({ playlists: [playlist], activeId: "one", favorites: {}, theme: "dark", channelOverrides: { one: overrides } });
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok && parsed.data.playlists[0]!.additionalEpgUrls).toEqual(playlist.additionalEpgUrls);
    expect(parsed.ok && parsed.data.channelOverrides?.one).toEqual(overrides);
    const damaged = parseBackup(JSON.stringify({ ...backup, playlists: [{ ...playlist, additionalEpgUrls: ["javascript:x", ...playlist.additionalEpgUrls] }] }));
    expect(damaged.ok && damaged.warnings).toContain("playlists");
    expect(damaged.ok && damaged.data.playlists[0]!.additionalEpgUrls).toEqual(playlist.additionalEpgUrls);
  });
});
