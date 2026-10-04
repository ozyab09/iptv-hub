import { describe, it, expect } from "vitest";
import { buildFavoritesM3U } from "../src/favorites";
import {
  parseM3U,
  normalizeName,
  detectQuality,
  extractAttr,
  isPlayableStreamUrl,
} from "../src/m3u";

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

describe("quoted EXTINF commas", () => {
  it("keeps commas inside attributes and attributes after them", () => {
    const result = parseM3U('#EXTM3U\n#EXTINF:-1 group-title="News, Talk" tvg-id="x" tvg-logo="https://fixture.test/logo,a.png" catchup-days="2",My Channel\nhttps://fixture.test/live.m3u8\n');
    expect(result.channels[0]).toMatchObject({ name: "My Channel", group: "News, Talk", tvgId: "x", logo: "https://fixture.test/logo,a.png", catchupDays: 2 });
    expect(result.categories).toEqual(["News, Talk"]);
  });
  it("preserves every comma in the channel name after the attribute separator", () => {
    const result = parseM3U('#EXTINF:-1 tvg-id="x" group-title="News, Talk",My Channel, Talk, HD\nhttps://fixture.test/live.m3u8\n');
    expect(result.channels[0]!.name).toBe("My Channel, Talk, HD");
    expect(result.channels[0]!.group).toBe("News, Talk");
  });
  it("round trips comma-containing attributes and names through favorites export", () => {
    const channel = parseM3U('#EXTINF:-1 tvg-id="x" group-title="News, Talk",My Channel, Talk\nhttps://fixture.test/live.m3u8\n').channels[0]!;
    const exported = buildFavoritesM3U([channel], new Set([channel.url]));
    expect(parseM3U(exported).channels).toEqual([channel]);
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

describe("isPlayableStreamUrl", () => {
  it("keeps https and non-http schemes", () => {
    expect(isPlayableStreamUrl("https://cdn.example.com/live.m3u8")).toBe(true);
    expect(isPlayableStreamUrl("rtmp://server/live")).toBe(true);
    expect(isPlayableStreamUrl("udp://@239.1.1.1:1234")).toBe(true);
  });

  it("drops public http hosts (mixed content on https page)", () => {
    expect(isPlayableStreamUrl("http://cdn.example.com/live.m3u8")).toBe(false);
    expect(isPlayableStreamUrl("http://cdn.example.com:8080/live.m3u8")).toBe(false);
  });

  it("keeps http on localhost and private networks", () => {
    expect(isPlayableStreamUrl("http://localhost:8080/live.m3u8")).toBe(true);
    expect(isPlayableStreamUrl("http://192.168.1.10:8000/live.m3u8")).toBe(true);
    expect(isPlayableStreamUrl("http://10.0.0.5/live.m3u8")).toBe(true);
    expect(isPlayableStreamUrl("http://mybox.local/live.m3u8")).toBe(true);
  });

  it("is false for garbage", () => {
    expect(isPlayableStreamUrl("not a url")).toBe(false);
    expect(isPlayableStreamUrl("")).toBe(false);
  });
});

describe("parseM3U: скрытие http-каналов", () => {
  const mixed = [
    "#EXTM3U",
    '#EXTINF:-1 group-title="Спорт",Public HTTP',
    "http://cdn.example.com/one.m3u8",
    '#EXTINF:-1 group-title="Спорт",Public HTTP Duplicate',
    "http://cdn.example.com/one.m3u8", // дедуп: не второй скрытый
    '#EXTINF:-1 group-title="Новости",HTTPS Channel',
    "https://stream.example.com/two.m3u8",
    '#EXTINF:-1 group-title="Основные",Home IPTV',
    "http://192.168.1.50:8000/three.m3u8",
  ].join("\n");

  const parsed = parseM3U(mixed);

  it("drops public http channels and counts them", () => {
    expect(parsed.channels.map((c) => c.name)).toEqual([
      "Home IPTV",
      "HTTPS Channel",
    ]);
    expect(parsed.droppedHttp).toBe(1);
  });

  it("keeps a duplicate http URL from double-counting", () => {
    expect(parsed.droppedHttp).toBe(1);
  });

  it("keeps home IPTV http channels playable in the list", () => {
    const home = parsed.channels.find((c) => c.name === "Home IPTV");
    expect(home?.url).toBe("http://192.168.1.50:8000/three.m3u8");
  });

  it("counts zero for an all-https playlist", () => {
    const allHttps = [
      "#EXTM3U",
      '#EXTINF:-1 group-title="Кино",Kino 4K',
      "https://stream.example.com/kino.m3u8",
    ].join("\n");
    expect(parseM3U(allHttps).droppedHttp).toBe(0);
  });
});
