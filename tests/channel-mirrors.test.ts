import { describe, expect, it } from "vitest";
import { createMirrorState, nextMirror } from "../src/channel-mirrors";
import { parseM3U } from "../src/m3u";
import { resolveChannelDeepLink } from "../src/deeplink";

describe("channel mirrors", () => {
  it("keeps ordered unique URLs and exhausts the list without looping", () => {
    const first = createMirrorState({ url: "https://a", mirrors: ["https://a", "https://b", "", "https://c", "https://b"] });
    expect(first.urls).toEqual(["https://a", "https://b", "https://c"]);
    const second = nextMirror(first)!;
    const third = nextMirror(second)!;
    expect(second.index).toBe(1);
    expect(third.index).toBe(2);
    expect(nextMirror(third)).toBeNull();
    expect(first.index).toBe(0);
    expect(nextMirror(createMirrorState({ url: "https://a" }))).toBeNull();
  });
  it("resolves a mirror deep link to the original channel identity", () => {
    expect(resolveChannelDeepLink([{ url: "https://first", mirrors: ["https://second"] }], "https://second")).toEqual({ found: true, url: "https://first" });
  });
  it("groups identical tvg-ids and pipe-separated mirrors, preserving first metadata", () => {
    const result = parseM3U('#EXTM3U\n#EXTINF:-1 tvg-id="News" group-title="First",Alpha\nhttps://a.test/live.m3u8 | https://b.test/live.m3u8\n#EXTINF:-1 tvg-id="news" group-title="Other",Beta\nhttps://c.test/live.mp4\n#EXTINF:-1 tvg-id="news",Duplicate\nhttps://b.test/live.m3u8');
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toMatchObject({ name: "Alpha", group: "First", url: "https://a.test/live.m3u8", mirrors: ["https://b.test/live.m3u8", "https://c.test/live.mp4"] });
    expect(result.categories).toEqual(["First"]);
  });
  it("does not merge same-name channels without matching IDs", () => {
    const result = parseM3U('#EXTINF:-1,Alpha\nhttps://a.test\n#EXTINF:-1,Alpha\nhttps://b.test\n#EXTINF:-1 tvg-id="a",Alpha\nhttps://c.test\n#EXTINF:-1 tvg-id="b",Alpha\nhttps://d.test');
    expect(result.channels).toHaveLength(4);
  });
  it("filters unsafe public HTTP mirrors individually and keeps private sources", () => {
    const result = parseM3U('#EXTINF:-1 tvg-id="a",Alpha\nhttp://public.test/live | https://safe.test/live | http://192.168.1.2/live\n#EXTINF:-1 tvg-id="a",Duplicate\nhttp://public.test/live');
    expect(result.channels[0]).toMatchObject({ url: "https://safe.test/live", mirrors: ["http://192.168.1.2/live"] });
    expect(result.droppedHttp).toBe(1);
  });
  it("preserves global URL deduplication across different IDs", () => {
    const result = parseM3U('#EXTINF:-1 tvg-id="a",First\nhttps://same.test\n#EXTINF:-1 tvg-id="b",Second\nhttps://same.test | https://other.test');
    expect(result.channels.map((c) => c.url)).toEqual(["https://same.test", "https://other.test"]);
  });
});
