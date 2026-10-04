import { describe, expect, it } from "vitest";
import { aggregatePlaylists, type AggregateSource } from "../src/playlist-aggregate";
import { parseM3U } from "../src/m3u";
import { getNowNext } from "../src/epg";
import { searchProgrammes } from "../src/programme-search";

const programme = (title: string) => ({ title, start: "2026-01-01T00:00:00Z", stop: "2026-01-02T00:00:00Z", desc: null });
function source(id: string, url = id): AggregateSource {
  return { id, name: id.toUpperCase(), snapshot: parseM3U(`#EXTM3U\n#EXTINF:-1 tvg-id="same" group-title="News",${id}\nhttps://fixture.test/${url}.mp4`),
    overrides: new Map(), hiddenGroups: new Set(), epg: new Map([["id:same", [programme(id + " show")]]]) };
}
describe("объединённые плейлисты", () => {
  it("дедуплицирует URL первым источником без изменения снимков", () => {
    const a = source("a", "same"), b = source("b", "same");
    const result = aggregatePlaylists([a, b]);
    expect(result.snapshot.channels).toHaveLength(1);
    expect(result.snapshot.channels[0]!.source?.id).toBe("a");
    expect(a.snapshot.channels[0]).not.toHaveProperty("source");
    expect(a.snapshot.channels[0]!.group).toBe("News");
  });
  it("применяет алиасы и скрытие своего источника до отображения", () => {
    const a = source("a"), b = source("b");
    b.overrides = new Map([[b.snapshot.channels[0]!.url, { alias: "Alias", hidden: false }]]);
    const result = aggregatePlaylists([a, b]);
    expect(result.snapshot.channels.map(c => [c.name, c.group, c.source?.group])).toEqual([["a", "A · News", "News"], ["Alias", "B · News", "News"]]);
    a.hiddenGroups = new Set(["News"]);
    expect(aggregatePlaylists([a, b]).snapshot.channels.map(c => c.name)).toEqual(["Alias"]);
    b.overrides = new Map([[b.snapshot.channels[0]!.url, { alias: "", hidden: true }]]);
    expect(aggregatePlaylists([a, b]).snapshot.channels).toEqual([]);
  });
  it("скрытый первый дубль не раскрывается вторым источником", () => {
    const a = source("a", "same"), b = source("b", "same");
    a.hiddenGroups = new Set(["News"]);
    expect(aggregatePlaylists([a, b]).snapshot.channels).toEqual([]);
  });
  it("изолирует одинаковые EPG id обоих провайдеров в бейджах и поиске", () => {
    const result = aggregatePlaylists([source("a"), source("b")]);
    expect(result.snapshot.channels.map(c => getNowNext(result.epg, c, result.snapshot, new Date("2026-01-01T12:00:00Z")).now?.title)).toEqual(["a show", "b show"]);
    expect(searchProgrammes(result.snapshot.channels, result.epg, "b show").map(m => m.channel.source?.id)).toEqual(["b"]);
  });
});
