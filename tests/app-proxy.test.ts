import { afterEach, describe, expect, it } from "vitest";
import { localProxyUrl, isAppPage, viaLocalProxy } from "../src/app-proxy";
import { isPlayableStreamUrl, parseM3U, setPublicHttpAllowed } from "../src/m3u";

const APP = "https://appassets.androidplatform.net/www/index.html";
const PAGES = "https://ozyab09.github.io/iptv-hub/";

// #452: прокси внутри Android-приложения — только на его локальном origin.
describe("app proxy URLs", () => {
  it("страница приложения распознаётся только по https и локальному хосту", () => {
    expect(isAppPage(APP)).toBe(true);
    expect(isAppPage(PAGES)).toBe(false);
    expect(isAppPage("http://appassets.androidplatform.net/www/")).toBe(false);
    expect(isAppPage("not a url")).toBe(false);
  });

  it("http публичного хоста в приложении уходит через /proxy/ с портом, путём и запросом", () => {
    expect(localProxyUrl("http://iptv.example:8080/live/a.m3u8?token=1", APP))
      .toBe("https://appassets.androidplatform.net/proxy/http/iptv.example:8080/live/a.m3u8?token=1");
    expect(localProxyUrl("http://iptv.example/list.m3u", APP))
      .toBe("https://appassets.androidplatform.net/proxy/http/iptv.example/list.m3u");
  });

  it("https, приватные адреса, чужие схемы и веб-версия не проксируются", () => {
    expect(localProxyUrl("https://cdn.example/a.m3u8", APP)).toBeNull();
    expect(localProxyUrl("http://192.168.1.2/a.m3u8", APP)).toBeNull();
    expect(localProxyUrl("rtmp://x/live", APP)).toBeNull();
    expect(localProxyUrl("http://iptv.example/a.m3u8", PAGES)).toBeNull();
    expect(viaLocalProxy("http://iptv.example/a.m3u8", PAGES)).toBe("http://iptv.example/a.m3u8");
  });
});

describe("public http channels in the app", () => {
  afterEach(() => setPublicHttpAllowed(false));
  const m3u = "#EXTM3U\n#EXTINF:-1,Public\nhttp://iptv.example/a.m3u8\n#EXTINF:-1,Secure\nhttps://cdn.example/b.m3u8\n";

  it("веб-версия скрывает http-каналы публичных хостов, как раньше", () => {
    const snap = parseM3U(m3u);
    expect(snap.channels.map((c) => c.name)).toEqual(["Secure"]);
    expect(snap.droppedHttp).toBe(1);
  });

  it("в приложении http-каналы остаются с исходным URL (идентичность канала)", () => {
    setPublicHttpAllowed(true);
    expect(isPlayableStreamUrl("http://iptv.example/a.m3u8")).toBe(true);
    const snap = parseM3U(m3u);
    expect(snap.channels.map((c) => c.url)).toEqual(["http://iptv.example/a.m3u8", "https://cdn.example/b.m3u8"]);
    expect(snap.droppedHttp).toBe(0);
  });
});
