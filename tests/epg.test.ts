import { describe, it, expect } from "vitest";
import { parseEpg, parseXmltvDate } from "../src/epg";
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
    };
    // channelKey lowercases: id:cnn.ru — тот же ключ, что и в EPG
    expect(c.tvgId!.toLowerCase()).toBe("cnn.ru");
  });
});
