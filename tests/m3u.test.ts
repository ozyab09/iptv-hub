import { describe, it, expect } from "vitest";
import { parseM3U, normalizeName, detectQuality, extractAttr } from "../src/m3u";

describe("normalizeName", () => {
  it("strips emoji, quality and separators", () => {
    expect(normalizeName("🔴🐱 CNN HD")).toBe("cnn");
    expect(normalizeName("BBC World ⭐️ (2)")).toBe("bbc world");
    expect(normalizeName("РБК | Новости")).toBe("рбк новости");
  });
});

describe("detectQuality", () => {
  it("detects tiers", () => {
    expect(detectQuality("Channel 4K")).toBe("4K");
    expect(detectQuality("Channel UHD")).toBe("4K");
    expect(detectQuality("Channel FHD")).toBe("FHD");
    expect(detectQuality("Channel HD")).toBe("HD");
    expect(detectQuality("Channel HDTV")).toBe("HD");
    expect(detectQuality("Channel SD")).toBe("SD");
    expect(detectQuality("Channel")).toBeNull();
  });
});

describe("extractAttr", () => {
  it("parses quoted attributes", () => {
    expect(extractAttr('tvg-id="cnn.ru" group-title="Новости"', "tvg-id")).toBe(
      "cnn.ru",
    );
    expect(extractAttr('tvg-id=""', "tvg-id")).toBe("");
    expect(extractAttr('group-title="Кино"', "tvg-name")).toBeNull();
  });
});

describe("parseM3U", () => {
  const sample = [
    "#EXTM3U url-tvg=\"https://example.com/epg.xml.gz\"",
    '#EXTINF:-1 tvg-id="cnn.ru" tvg-logo="https://img/cnn.png" group-title="Новости",CNN HD',
    "https://stream.example.com/cnn.m3u8",
    "#EXTINF:-1 group-title=\"Спорт\",Football FHD",
    "https://stream.example.com/football.m3u8",
    "#EXTINF:-1 group-title=\"Спорт\",Football FHD",
    "https://stream.example.com/football-2.m3u8",
    "#EXTINF:-1 group-title=\"Кино\",Kino 4K",
    "https://stream.example.com/kino.m3u8",
    "#EXTINF:-1 group-title=\"Кино\",NoUrl Channel",
    "#EXTVLCOPT:http-user-agent=VLC",
    "#EXTINF:-1 group-title=\"Основные\",Last One",
    "https://stream.example.com/last.m3u8",
    "",
  ].join("\n");

  const parsed = parseM3U(sample);

  it("parses header tvg-url", () => {
    expect(parsed.headerTvgUrl).toBe("https://example.com/epg.xml.gz");
  });

  it("parses channels with attributes and sorts by name", () => {
    expect(parsed.channels.map((c) => c.name)).toEqual([
      "CNN HD",
      "Football FHD",
      "Football FHD",
      "Kino 4K",
      "Last One",
    ]);
  });

  it("extracts tvg-id, logo and group", () => {
    const cnn = parsed.channels[0]!;
    expect(cnn.tvgId).toBe("cnn.ru");
    expect(cnn.logo).toBe("https://img/cnn.png");
    expect(cnn.group).toBe("Новости");
    expect(cnn.quality).toBe("HD");
  });

  it("drops duplicate URLs (first variant wins)", () => {
    const dup = parseM3U(
      [
        "#EXTM3U",
        '#EXTINF:-1 group-title="Спорт",Football FHD',
        "https://stream.example.com/football.m3u8",
        '#EXTINF:-1 group-title="Спорт",Football FHD',
        "https://stream.example.com/football.m3u8",
      ].join("\n"),
    );
    expect(dup.channels).toHaveLength(1);
  });

  it("keeps same-name variants with distinct URLs", () => {
    const football = parsed.channels.filter((c) => c.name === "Football FHD");
    expect(football).toHaveLength(2);
    expect(football[0]!.url).toBe("https://stream.example.com/football.m3u8");
  });

  it("drops entries without a stream URL", () => {
    expect(
      parsed.channels.find((c) => c.name === "NoUrl Channel"),
    ).toBeUndefined();
  });

  it("collects unique sorted categories", () => {
    expect(parsed.categories).toEqual(["Кино", "Новости", "Основные", "Спорт"]);
  });
});
