import { describe, expect, it } from "vitest";
import { channelHealthKey, clearChannelFailure, isChannelRecovered, markChannelFailure, parseChannelHealth, serializeChannelHealth } from "../src/channel-health";

describe("channel health", () => {
  it("requires playing for audio and decoded frames for a known video track", () => {
    const audio = { readyState: 2, videoWidth: 0, error: null };
    expect(isChannelRecovered(audio, "loadeddata", false)).toBe(false);
    expect(isChannelRecovered(audio, "playing", false)).toBe(true);
    expect(isChannelRecovered(audio, "playing", true)).toBe(false);
    expect(isChannelRecovered({ ...audio, videoWidth: 160 }, "loadeddata", true)).toBe(true);
    expect(isChannelRecovered({ ...audio, readyState: 1 }, "playing", false)).toBe(false);
    expect(isChannelRecovered({ ...audio, error: { code: 3 } }, "playing", false)).toBe(false);
    expect(isChannelRecovered({ ...audio, videoWidth: 160, error: { code: 3 } }, "playing", true)).toBe(false);
  });
  const url = "https://fixture.test/live.m3u8";
  it("isolates playlists and round trips versioned failures", () => {
    expect(channelHealthKey("a")).not.toBe(channelHealthKey("b"));
    const health = markChannelFailure(new Map(), url, { failedAt: 1000, kind: "http", status: 404 });
    expect(parseChannelHealth(serializeChannelHealth(health))).toEqual(health);
    expect(JSON.parse(serializeChannelHealth(health)).version).toBe(1);
  });
  it("defaults invalid and foreign JSON to no marks", () => {
    for (const raw of [null, "{", "[]", "null", "3", '{"version":2,"failures":[]}', '{"version":1,"failures":{}}']) {
      expect(parseChannelHealth(raw).size).toBe(0);
    }
  });
  it("skips invalid entries and sanitizes HTTP status", () => {
    const failures = [null, {}, { url, failedAt: "1000", kind: "http" }, { url, failedAt: -1, kind: "http" },
      { url: "javascript:alert(1)", failedAt: 1, kind: "unknown" }, { url, failedAt: 1, kind: "alien" },
      { url, failedAt: 1, kind: "http", status: 999 }, { url: url + "?other", failedAt: 2, kind: "blocked", status: 404 }];
    const health = parseChannelHealth(JSON.stringify({ version: 1, failures }));
    expect([...health]).toEqual([[url, { failedAt: 1, kind: "http" }], [url + "?other", { failedAt: 2, kind: "blocked" }]]);
  });
  it("updates a channel without mutating previous state or supplied metadata", () => {
    const failure = { failedAt: 1, kind: "unknown" as const };
    const before = markChannelFailure(new Map(), url, failure);
    failure.failedAt = 10;
    expect(before.get(url)?.failedAt).toBe(1);
    const after = markChannelFailure(before, url, { failedAt: 20, kind: "mixed-content" });
    expect(before.get(url)?.kind).toBe("unknown");
    expect(after.get(url)).toEqual({ failedAt: 20, kind: "mixed-content" });
  });
  it("clears only the recovered channel and preserves other marks", () => {
    const before = markChannelFailure(markChannelFailure(new Map(), url, { failedAt: 1, kind: "unknown" }), "https://other.test/live", { failedAt: 2, kind: "blocked" });
    expect(clearChannelFailure(before, "missing")).toBe(before);
    expect([...clearChannelFailure(before, url).keys()]).toEqual(["https://other.test/live"]);
    expect(before.size).toBe(2);
  });
});
