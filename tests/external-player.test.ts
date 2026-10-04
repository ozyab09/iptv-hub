import { describe, expect, it, vi } from "vitest";
import { copyText, externalPlayerBridge, isExternalPlayable, openExternally, streamLink } from "../src/external-player";

describe("external player (#372)", () => {
  it("плееру отдаются только сетевые медиа-схемы", () => {
    for (const url of ["https://x/a.m3u8", "http://192.168.1.2/a.ts", "rtmp://x/live", "rtsp://cam/1", "udp://239.0.0.1:1234"]) {
      expect(isExternalPlayable(url)).toBe(true);
    }
    for (const url of ["javascript:alert(1)", "blob:https://x/1", "local:abc", "file:///a.mp4", ""]) {
      expect(isExternalPlayable(url)).toBe(false);
    }
  });

  it("ссылка источника: архив важнее канала, локальные источники не отдаются", () => {
    expect(streamLink("https://x/live.m3u8", null)).toBe("https://x/live.m3u8");
    expect(streamLink("https://x/live.m3u8", "https://x/archive.m3u8?utc=1")).toBe("https://x/archive.m3u8?utc=1");
    expect(streamLink(null, null)).toBeNull();
    expect(streamLink("blob:https://x/rec", null)).toBeNull();
  });

  it("мост приложения: есть — ссылка уходит в него, нет — false", () => {
    const postMessage = vi.fn();
    const bridge = externalPlayerBridge({ IPTVHubExternalPlayer: { postMessage } });
    expect(openExternally(bridge, "https://x/a.m3u8")).toBe(true);
    expect(postMessage).toHaveBeenCalledWith("https://x/a.m3u8");
    expect(openExternally(bridge, "javascript:alert(1)")).toBe(false);
    expect(externalPlayerBridge({})).toBeNull();
    expect(openExternally(null, "https://x/a.m3u8")).toBe(false);
  });

  it("копирование: Clipboard API, запасной путь при отказе, без исключений", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyText("u", { clipboard: { writeText } })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("u");
    const denied = { writeText: vi.fn(async () => { throw new DOMException("denied", "NotAllowedError"); }) };
    const fallback = vi.fn(() => true);
    expect(await copyText("u", { clipboard: denied, fallback })).toBe(true);
    expect(fallback).toHaveBeenCalledWith("u");
    expect(await copyText("u", { clipboard: null, fallback: () => { throw new Error("private"); } })).toBe(false);
    expect(await copyText("u", {})).toBe(false);
  });
});
