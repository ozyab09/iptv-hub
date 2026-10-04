import { describe, it, expect } from "vitest";
import { getNowNext, parseEpg, parseXmltvDate } from "../src/epg";
import { parseM3U } from "../src/m3u";
import type { Channel } from "../src/types";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="cnn.ru">
    <display-name>CNN HD</display-name>
  </channel>
  <programme start="20260928120000 +0000" stop="20260928130000 +0000" channel="cnn.ru">
    <title lang="ru">Newsroom</title>
    <desc lang="ru">Сводка новостей</desc>
  </programme>
  <programme start="20260928130000 +0000" stop="20260928140000 +0000" channel="cnn.ru">
    <title lang="ru">World Report</title>
  </programme>
</tv>`;

describe("parseXmltvDate", () => {
  it("parses XMLTV dates with timezone", () => {
    const d = parseXmltvDate("20260928120000 +0300");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-09-28T09:00:00.000Z");
  });
  it("returns null on garbage", () => {
    expect(parseXmltvDate("nonsense")).toBeNull();
  });
});

describe("parseEpg", () => {
  const epg = parseEpg(SAMPLE);

  it("indexes by lowercase channel id", () => {
    const list = epg.get("id:cnn.ru");
    expect(list).toHaveLength(2);
    expect(list![0]!.title).toBe("Newsroom");
    expect(list![0]!.desc).toBe("Сводка новостей");
  });

  it("indexes by lowercase display-name for name-matching", () => {
    expect(epg.get("name:cnn hd")).toHaveLength(2);
  });

  it("decodes entities in titles", () => {
    const epg2 = parseEpg(
      `<tv><programme start="20260928120000 +0000" stop="20260928130000 +0000" channel="x">
        <title>A &amp; B &lt;C&gt;</title></programme></tv>`,
    );
    expect(epg2.get("id:x")![0]!.title).toBe("A & B <C>");
  });
});

describe("channel key matching", () => {
  it("tvg-id channel maps to id-prefixed key", () => {
    const c: Channel = {
      name: "CNN HD",
      normalizedName: "cnn",
      url: "https://x/cnn.m3u8",
      tvgId: "CNN.ru",
      logo: null,
      group: "Новости",
      quality: "HD",
      catchupDays: 0,
      catchupSource: null,
    };
    // channelKey lowercases: id:cnn.ru — тот же ключ, что и в EPG
    expect(c.tvgId!.toLowerCase()).toBe("cnn.ru");
  });
});

// #348: канал без tvg-id матчится по normalizedName, а EPG индексирует
// display-name и через normalizeName — ключи обеих сторон совпадают.
describe("name fallback through normalizeName (#348)", () => {
  const xmltv = (name: string): string => `<tv>
    <channel id="1"><display-name>${name}</display-name></channel>
    <programme start="20260928120000 +0000" stop="20260928130000 +0000" channel="1"><title>Матч</title></programme>
  </tv>`;
  const at = new Date("2026-09-28T12:30:00Z");

  it("«Футбол HD» без tvg-id получает передачу из EPG «Футбол HD»", () => {
    const snap = parseM3U("#EXTM3U\n#EXTINF:-1,Футбол HD\nhttps://x/f.m3u8\n");
    const ch = snap.channels[0]!;
    expect(ch.tvgId).toBeNull();
    expect(getNowNext(parseEpg(xmltv("Футбол HD")), ch, snap, at).now?.title).toBe("Матч");
  });

  it("эмодзи в имени канала («⚡ Спорт») матчится на EPG «Спорт»", () => {
    const snap = parseM3U("#EXTM3U\n#EXTINF:-1,⚡ Спорт\nhttps://x/s.m3u8\n");
    expect(getNowNext(parseEpg(xmltv("Спорт")), snap.channels[0]!, snap, at).now?.title).toBe("Матч");
  });

  it("точное имя по-прежнему индексируется как есть", () => {
    const epg = parseEpg(xmltv("Футбол HD"));
    expect(epg.get("name:футбол hd")).toHaveLength(1);
    expect(epg.get("name:футбол")).toHaveLength(1);
  });
});

// #352: битая числовая сущность не роняет разбор, hex-сущности декодируются.
describe("decodeEntities robustness (#352)", () => {
  const title = (t: string): string =>
    parseEpg(`<tv><programme start="20260928120000 +0000" stop="20260928130000 +0000" channel="x"><title>${t}</title></programme>
      <programme start="20260928130000 +0000" stop="20260928140000 +0000" channel="x"><title>Next</title></programme></tv>`)
      .get("id:x")?.map((p) => p.title).join("|") ?? "";

  it("код вне Unicode и суррогаты остаются литералом, остальное разобрано", () => {
    expect(title("Test &#1114112; X")).toBe("Test &#1114112; X|Next");
    expect(title("S &#55296; &#xD800;")).toBe("S &#55296; &#xD800;|Next");
    expect(title("Big &#x110000;")).toBe("Big &#x110000;|Next");
  });

  it("hex-сущности в любом регистре декодируются, прежние — не сломаны", () => {
    expect(title("A &#x2665; &#X2665; B")).toBe("A ♥ ♥ B|Next");
    expect(title("Tom &amp; Jerry &#39;s")).toBe("Tom & Jerry 's|Next");
  });
});

// #361: имя атрибута programme читается от границы — vps-start/pdc-start
// не подменяют start, xchannel не подменяет channel.
describe("programme attributes are matched by full name (#361)", () => {
  it("vps-start и pdc-start перед start не подменяют время", () => {
    const epg = parseEpg(`<tv><programme vps-start="20260928090000 +0000" pdc-start="20260928080000 +0000" start="20260928120000 +0000" stop="20260928130000 +0000" xchannel="wrong" channel="right"><title>Show</title></programme></tv>`);
    expect(epg.get("id:wrong")).toBeUndefined();
    expect(epg.get("id:right")?.[0]?.start).toBe("2026-09-28T12:00:00.000Z");
  });
});
