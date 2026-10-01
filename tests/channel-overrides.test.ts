import { describe, expect, it } from "vitest";
import { applyChannelOverrides, channelOverridesKey, parseChannelOverrides, serializeChannelOverrides, setChannelOverride } from "../src/channel-overrides";
import { parseM3U } from "../src/m3u";
import { searchProgrammes } from "../src/programme-search";
import { resolveChannelDeepLink } from "../src/deeplink";

const channels = parseM3U('#EXTM3U\n#EXTINF:-1,Original HD\nhttps://fixture.test/one\n#EXTINF:-1,Second\nhttps://fixture.test/two\n').channels;
describe("локальные имена и скрытие", () => {
  it("меняет имя без изменения исходного плейлиста и EPG-ключа", () => {
    const result = applyChannelOverrides(channels, setChannelOverride(new Map(), channels[0]!.url, " Alias ", false));
    expect(result[0]!.name).toBe("Alias");
    expect(result[0]!.normalizedName).toBe(channels[0]!.normalizedName);
    expect(result[0]!.quality).toBe("HD");
    expect(channels[0]!.name).toBe("Original HD");
  });
  it("пустой алиас восстанавливает имя, сохраняя скрытие", () => {
    const renamed = setChannelOverride(new Map(), channels[0]!.url, "Alias", true);
    const cleared = setChannelOverride(renamed, channels[0]!.url, "  ", true);
    expect(applyChannelOverrides(channels, cleared, true)[0]!.name).toBe("Original HD");
    expect(applyChannelOverrides(channels, cleared)).toHaveLength(1);
    expect(setChannelOverride(cleared, channels[0]!.url, "", false).size).toBe(0);
  });
  it("скрытый канал исключён из выдачи, но доступен диплинку с алиасом", () => {
    const overrides = setChannelOverride(new Map(), channels[0]!.url, "Alias", true);
    const list = applyChannelOverrides(channels, overrides);
    expect(list.map((c) => c.name)).toEqual(["Second"]);
    const full = applyChannelOverrides(channels, overrides, true);
    expect(resolveChannelDeepLink(full, channels[0]!.url).found).toBe(true);
    expect(full[0]!.name).toBe("Alias");
  });
  it("поиск передач продолжает работать по исходному имени", () => {
    const list = applyChannelOverrides(channels, setChannelOverride(new Map(), channels[0]!.url, "Alias", false));
    const epg = new Map([[`name:${channels[0]!.normalizedName}`, [{ title: "News", start: "2026-10-01T00:00:00Z", stop: "2026-10-01T01:00:00Z", desc: null }]]]);
    expect(searchProgrammes(list, epg, "news")[0]!.channel.name).toBe("Alias");
  });
  it("хранение разделено по плейлистам и переживает сериализацию", () => {
    expect(channelOverridesKey("one")).not.toBe(channelOverridesKey("two"));
    const value = setChannelOverride(new Map(), channels[0]!.url, "<Name>", true);
    expect(parseChannelOverrides(serializeChannelOverrides(value))).toEqual(value);
  });
  it("отбрасывает повреждённые записи и нормализует поля", () => {
    for (const raw of [null, "broken", "{}", "42"]) expect(parseChannelOverrides(raw).size).toBe(0);
    expect(parseChannelOverrides('[null,{}, {"url":"one","alias":"  Name  ","hidden":"true"}]').get("one")).toEqual({ alias: "Name", hidden: false });
    expect(setChannelOverride(new Map(), "one", "a".repeat(200), false).get("one")!.alias).toHaveLength(120);
  });
});
