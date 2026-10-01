import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  isMixedContent,
  isPrivateHost,
  STORAGE_KEY,
} from "../src/config";

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

describe("isMixedContent", () => {
  it("flags http targets from an https page", () => {
    expect(
      isMixedContent(
        "https://ozyab09.github.io/iptv-hub/",
        "http://storage.example.net/playlist.m3u",
      ),
    ).toBe(true);
  });

  it("allows https targets from an https page", () => {
    expect(
      isMixedContent(
        "https://ozyab09.github.io/iptv-hub/",
        "https://storage.yandexcloud.net/bucket/playlist.m3u",
      ),
    ).toBe(false);
  });

  it("allows http targets from an http (localhost) page", () => {
    expect(
      isMixedContent("http://localhost:5173/", "http://127.0.0.1:9000/pl.m3u"),
    ).toBe(false);
  });

  it("is false for garbage URLs", () => {
    expect(isMixedContent("https://x/", "not a url")).toBe(false);
  });
});

describe("isPrivateHost", () => {
  it("flags localhost and loopback", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("::1")).toBe(true);
  });

  it("flags RFC1918 networks and .local", () => {
    expect(isPrivateHost("192.168.1.10")).toBe(true);
    expect(isPrivateHost("10.0.0.5")).toBe(true);
    expect(isPrivateHost("172.16.0.1")).toBe(true);
    expect(isPrivateHost("172.31.255.1")).toBe(true);
    expect(isPrivateHost("mybox.local")).toBe(true);
  });

  it("does not flag public hosts", () => {
    expect(isPrivateHost("cdn.example.com")).toBe(false);
    expect(isPrivateHost("172.32.0.1")).toBe(false);
    expect(isPrivateHost("example.localhosts.com")).toBe(false);
  });
});
