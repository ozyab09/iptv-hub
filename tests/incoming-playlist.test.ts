import { describe, expect, it } from "vitest";
import { isPlaylistFileName, sharedPlaylistUrl, shareTargetSearch } from "../src/incoming-playlist";

describe("incoming playlist (#373)", () => {
  it("ссылка из параметра url или из текста сообщения", () => {
    expect(sharedPlaylistUrl(new URLSearchParams("url=https://x/p.m3u"))).toBe("https://x/p.m3u");
    expect(sharedPlaylistUrl(new URLSearchParams({ text: "Смотри плейлист: https://x/p.m3u8?t=1." }))).toBe("https://x/p.m3u8?t=1");
    expect(sharedPlaylistUrl(new URLSearchParams({ url: "javascript:alert(1)", text: "без ссылки" }))).toBeNull();
  });

  it("share_target превращается в ?p=, остальные параметры сохраняются", () => {
    expect(shareTargetSearch("?title=TV&text=" + encodeURIComponent("https://x/p.m3u"))).toBe("?p=" + encodeURIComponent("https://x/p.m3u"));
    expect(shareTargetSearch("?debug=1&url=" + encodeURIComponent("https://x/p.m3u"))).toBe("?debug=1&p=" + encodeURIComponent("https://x/p.m3u"));
    expect(shareTargetSearch("?text=hello")).toBe("");
  });

  it("обычные адреса и явный ?p= не трогаются", () => {
    expect(shareTargetSearch("")).toBeNull();
    expect(shareTargetSearch("?debug=1")).toBeNull();
    expect(shareTargetSearch("?p=https://a&url=https://b")).toBeNull();
  });

  it("файлы плейлистов по расширению", () => {
    expect(isPlaylistFileName("list.m3u")).toBe(true);
    expect(isPlaylistFileName("LIST.M3U8")).toBe(true);
    expect(isPlaylistFileName("video.mp4")).toBe(false);
  });
});
