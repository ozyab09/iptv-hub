import { describe, it, expect } from "vitest";
import { resolveConfig, STORAGE_KEY } from "../src/config";

const store = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
};

describe("resolveConfig", () => {
  it("prefers query params and persists them", () => {
    const s = store();
    const cfg = resolveConfig(
      "?p=https%3A%2F%2Fexample.com%2Fplaylist.m3u&e=https%3A%2F%2Fexample.com%2Fepg.xml.gz",
      s,
    );
    expect(cfg).toEqual({
      playlistUrl: "https://example.com/playlist.m3u",
      epgUrl: "https://example.com/epg.xml.gz",
    });
    expect(s.getItem(STORAGE_KEY)).toContain("playlist.m3u");
  });

  it("falls back to localStorage", () => {
    const s = store();
    s.setItem(
      STORAGE_KEY,
      JSON.stringify({ playlistUrl: "https://s3.mysite/playlist.m3u", epgUrl: null }),
    );
    const cfg = resolveConfig("", s);
    expect(cfg?.playlistUrl).toBe("https://s3.mysite/playlist.m3u");
    expect(cfg?.epgUrl).toBeNull();
  });

  it("rejects non-http playlist URLs", () => {
    expect(resolveConfig("?p=javascript:alert(1)", store())).toBeNull();
    expect(resolveConfig("?p=not-a-url", store())).toBeNull();
  });

  it("returns null when nothing is configured", () => {
    expect(resolveConfig("", store())).toBeNull();
  });

  it("ignores invalid epg but keeps playlist", () => {
    const cfg = resolveConfig("?p=https://ok.m3u&e=garbage", store());
    expect(cfg?.epgUrl).toBeNull();
    expect(cfg?.playlistUrl).toBe("https://ok.m3u");
  });
});
