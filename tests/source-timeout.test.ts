import { afterEach, describe, expect, it, vi } from "vitest";
import { SOURCE_TIMEOUT_MS, withSourceTimeout } from "../src/source-timeout";
import { createTransport } from "../src/playlist-transport";
import { loadEpg } from "../src/epg";
import { t } from "../src/i18n";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("source loading deadline", () => {
  it("rejects a stalled operation and aborts its request at 45 seconds", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    const load = withSourceTimeout((s) => { signal = s; return new Promise(() => {}); });
    const result = expect(load).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS - 1);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline after success and after an ordinary failure", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    await expect(withSourceTimeout(async (s) => { signal = s; return 42; })).resolves.toBe(42);
    await expect(withSourceTimeout(async () => { throw new Error("HTTP 503"); })).rejects.toThrow("HTTP 503");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);
    expect(signal!.aborted).toBe(false);
  });

  it.each(["headers", "body"])("playlist %s timeout permits another load", async (phase) => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => phase === "headers" ? await new Promise<Response>(() => {})
      : new Response(new ReadableStream(), { headers: { "content-type": "text/plain" } }));
    const transport = createTransport({ fs: () => null, language: () => "ru", fetch });
    const failed = expect(transport.loadPlaylist("https://fixture.test/list.m3u")).rejects.toThrow(t("error.sourceTimeout", "ru"));
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);
    await failed;
    fetch.mockResolvedValueOnce(new Response("#EXTM3U\n#EXTINF:-1,News\nhttps://fixture.test/live.mp4"));
    await expect(transport.loadPlaylist("https://fixture.test/list.m3u")).resolves.toMatchObject({ channels: [{ name: "News" }] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("EPG body timeout settles with content-length=%s", async (hasLength) => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response(new ReadableStream(), { headers: hasLength ? { "content-length": "100" } : {} }));
    vi.stubGlobal("fetch", fetch);
    const failed = expect(loadEpg("https://fixture.test/epg.xml")).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);
    await failed;
    expect(fetch.mock.calls[0]).toBeDefined();
    fetch.mockResolvedValueOnce(new Response("<tv></tv>"));
    await expect(loadEpg("https://fixture.test/epg.xml")).resolves.toEqual(new Map());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts both parallel Xtream requests when either response stalls", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      signals.push(init!.signal!);
      return url.includes("get_live_categories") ? new Response("[]") : await new Promise<Response>(() => {});
    });
    const transport = createTransport({ fs: () => null, language: () => "en", fetch });
    const failed = expect(transport.loadPlaylist("https://fixture.test/player_api.php?username=user&password=test&action=get_live_streams")).rejects.toThrow(t("error.sourceTimeout", "en"));
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);
    await failed;
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
