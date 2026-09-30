import { describe, expect, it } from "vitest";
import { resolveChannelDeepLink } from "../src/deeplink";

const channels = [
  { url: "https://a/stream" },
  { url: "https://b/stream" },
];

describe("resolveChannelDeepLink", () => {
  it("находит канал по точному URL", () => {
    expect(resolveChannelDeepLink(channels, "https://b/stream")).toEqual({
      found: true,
      url: "https://b/stream",
    });
  });

  it("обрезает пробелы", () => {
    expect(resolveChannelDeepLink(channels, " https://a/stream ").found).toBe(true);
  });

  it("не-http(s) URL игнорируется", () => {
    expect(resolveChannelDeepLink(channels, "javascript:alert(1)").found).toBe(false);
    expect(resolveChannelDeepLink(channels, "").found).toBe(false);
    expect(resolveChannelDeepLink(channels, null).found).toBe(false);
  });

  it("неизвестный канал — not found", () => {
    expect(resolveChannelDeepLink(channels, "https://x/stream").found).toBe(false);
  });
});
