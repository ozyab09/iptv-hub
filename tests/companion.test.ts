import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPANION_DOWNLOADS,
  connectCompanion,
  detectPlatform,
  loadCompanionEnabled,
  saveCompanionEnabled,
  takeCompanionParam,
} from "../src/companion";
import { companionProxyUrl } from "../src/companion";
import { hasLocalProxy, localDataProxyUrl, localProxyUrl, setCompanionPairing, viaDataProxy } from "../src/app-proxy";
import { memoryStorage } from "./fakes/storage";

const TOKEN = "a".repeat(64);
const PAGES = "https://ozyab09.github.io/iptv-hub/";

function fakeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    if (!(url in routes)) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(routes[url]));
  });
}

const healthy = {
  "http://127.0.0.1:47800/health": { app: "iptv-hub-companion", version: "0.3.0", protocol: 1 },
  "http://127.0.0.1:47800/pair": { token: TOKEN, proxyBase: `http://127.0.0.1:47800/proxy/${TOKEN}`, protocol: 1 },
};

// #465: подключение сайта к компаньону на 127.0.0.1.
describe("connectCompanion", () => {
  it("health → pair: сопряжение с токеном и префиксом прокси", async () => {
    expect(await connectCompanion(fakeFetch(healthy))).toEqual({
      state: "connected",
      pairing: { token: TOKEN, proxyBase: `http://127.0.0.1:47800/proxy/${TOKEN}`, version: "0.3.0" },
    });
  });

  it("не запущен, чужое приложение на порту или подменённый proxyBase — недоступен", async () => {
    expect(await connectCompanion(fakeFetch({}))).toEqual({ state: "unavailable" });
    expect(await connectCompanion(fakeFetch({ "http://127.0.0.1:47800/health": { app: "other" } }))).toEqual({ state: "unavailable" });
    expect(await connectCompanion(fakeFetch({ ...healthy, "http://127.0.0.1:47800/pair": { token: TOKEN, proxyBase: "https://evil.example/proxy" } })))
      .toEqual({ state: "unavailable" });
  });

  it("другая версия протокола — просим обновить компаньон", async () => {
    expect(await connectCompanion(fakeFetch({ "http://127.0.0.1:47800/health": { app: "iptv-hub-companion", version: "9.0.0", protocol: 2 } })))
      .toEqual({ state: "outdated", version: "9.0.0" });
  });

  it("зависший компаньон не тормозит запуск: таймаут", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const result = connectCompanion(hanging, 2500);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await result).toEqual({ state: "unavailable" });
    vi.useRealTimers();
  });
});

describe("companion settings and links", () => {
  it("режим включается явно и сохраняется", () => {
    const storage = memoryStorage();
    expect(loadCompanionEnabled(storage)).toBe(false);
    saveCompanionEnabled(storage, true);
    expect(loadCompanionEnabled(storage)).toBe(true);
    storage.setItem("iptv-hub.companion.v1", "{oops");
    expect(loadCompanionEnabled(storage)).toBe(false);
  });

  it("?companion=1 из трея включает режим и убирается из адреса", () => {
    expect(takeCompanionParam("?companion=1")).toEqual({ enable: true, search: "" });
    expect(takeCompanionParam("?debug=1&companion=1")).toEqual({ enable: true, search: "?debug=1" });
    expect(takeCompanionParam("?debug=1")).toEqual({ enable: false, search: "?debug=1" });
  });

  it("ОС посетителя и ссылки на все платформы", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("other");
    expect(new Set(COMPANION_DOWNLOADS.map((d) => d.platform))).toEqual(new Set(["windows", "macos", "linux"]));
    for (const d of COMPANION_DOWNLOADS) expect(d.url).toMatch(/^https:\/\/github\.com\/ozyab09\/iptv-hub\/releases\/latest\/download\/iptv-hub-companion-/);
  });
});

describe("local proxy through the companion", () => {
  afterEach(() => setCompanionPairing(null));
  const pairing = { token: TOKEN, proxyBase: `http://127.0.0.1:47800/proxy/${TOKEN}`, version: "0.3.0" };

  it("без сопряжения веб-версия не проксирует", () => {
    expect(hasLocalProxy(PAGES)).toBe(false);
    expect(localProxyUrl("http://iptv.example/a.m3u8", PAGES)).toBeNull();
    expect(viaDataProxy("https://cassy.tv/pls/x/playlist.m3u8", PAGES)).toBe("https://cassy.tv/pls/x/playlist.m3u8");
  });

  it("с сопряжением http публичного хоста идёт через 127.0.0.1 с токеном", () => {
    setCompanionPairing(pairing);
    expect(hasLocalProxy(PAGES)).toBe(true);
    expect(localProxyUrl("http://iptv.example:8080/live/a.m3u8?t=1", PAGES))
      .toBe(`http://127.0.0.1:47800/proxy/${TOKEN}/http/iptv.example:8080/live/a.m3u8?t=1`);
    expect(localProxyUrl("https://cdn.example/a.m3u8", PAGES)).toBeNull();
    expect(localProxyUrl("http://192.168.1.5/a.m3u8", PAGES)).toBeNull();
  });

  it("с сопряжением данные по https идут через компаньона — провайдер без CORS (#465)", () => {
    setCompanionPairing(pairing);
    expect(localDataProxyUrl("https://cassy.tv/pls/x/playlist.m3u8?e=1", PAGES))
      .toBe(`http://127.0.0.1:47800/proxy/${TOKEN}/https/cassy.tv/pls/x/playlist.m3u8?e=1`);
    expect(localDataProxyUrl("https://cassy.tv/epg/epg.xml.gz", PAGES))
      .toBe(`http://127.0.0.1:47800/proxy/${TOKEN}/https/cassy.tv/epg/epg.xml.gz`);
    // Потоки https остаются прямыми, приватные хосты не проксируются и для данных.
    expect(localProxyUrl("https://cdn.example/live/a.m3u8", PAGES)).toBeNull();
    expect(localDataProxyUrl("https://192.168.1.5/epg.xml", PAGES)).toBeNull();
    expect(localDataProxyUrl("http://iptv.example/list.m3u", PAGES))
      .toBe(`http://127.0.0.1:47800/proxy/${TOKEN}/http/iptv.example/list.m3u`);
  });

  it("companionProxyUrl сохраняет схему и порт целевого URL", () => {
    expect(companionProxyUrl(new URL("https://cassy.tv:8443/pls/a.m3u8?x=1"), pairing))
      .toBe(`http://127.0.0.1:47800/proxy/${TOKEN}/https/cassy.tv:8443/pls/a.m3u8?x=1`);
    expect(companionProxyUrl(new URL("http://iptv.example/live/a.m3u8"), pairing))
      .toBe(`http://127.0.0.1:47800/proxy/${TOKEN}/http/iptv.example/live/a.m3u8`);
  });
});
