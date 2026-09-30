import { describe, expect, it } from "vitest";
import { searchProgrammes, programmeArchiveUrl } from "../src/programme-search";
import type { Channel, EpgProgramme } from "../src/types";

const channel: Channel = {
  name: "Спорт", normalizedName: "спорт", url: "https://example.test/live",
  tvgId: "SPORT", logo: null, group: "Спорт", quality: null,
  catchupDays: 2, catchupSource: "https://example.test/archive/{utc}/{duration}",
};
const programme: EpgProgramme = {
  title: "Футбол: финал", start: "2026-09-30T10:00:00Z",
  stop: "2026-09-30T12:00:00Z", desc: null,
};
const epg = new Map([["id:sport", [programme]], ["name:спорт", [programme]]]);
const now = new Date("2026-09-30T13:00:00Z");

describe("searchProgrammes", () => {
  it.each([
    ["Что? Где? Когда?", "что где когда"],
    ["Что? Где? Когда?", " Что? Где? Когда? "],
    ["Что? Где? Когда?", "ГДЕ КОГДА"],
    ["Что?\u00a0Где?\tКогда?", "что   где\nкогда"],
    ["Новости—24: выпуск №1", "новости 24 выпуск №1"],
    ["«Футбол»: финал (2026)", "футбол-финал, 2026"],
    ["HD: Москва", "hd москва"],
    ["Café: новости", "Cafe\u0301 новости"],
  ])("находит «%s» по запросу «%s», сохраняя исходное название", (title, query) => {
    const original = { ...programme, title };
    const result = searchProgrammes([channel], new Map([["id:sport", [original]]]), query);
    expect(result).toEqual([{ channel, programme: original }]);
    expect(result[0]?.programme).toBe(original);
  });
  it.each(["???", " — … , : «» ", "\t\n\u00a0"])("не выводит все передачи для пустого запроса «%s»", (query) => {
    expect(searchProgrammes([channel], epg, query)).toEqual([]);
  });
  it("пунктуация разделяет слова, не склеивая их", () => {
    expect(searchProgrammes([channel], epg, "футболфинал")).toEqual([]);
  });
  it("ищет подстроку названия без учёта регистра и краевых пробелов", () => {
    expect(searchProgrammes([channel], epg, " ФУТБОЛ ")).toEqual([{ channel, programme }]);
  });
  it("не дублирует результат через индекс имени или повтор XMLTV", () => {
    expect(searchProgrammes([channel], new Map([["id:sport", [programme, { ...programme }]]]), "финал")).toHaveLength(1);
  });
  it("использует имя без tvg-id и при отсутствии id в EPG", () => {
    expect(searchProgrammes([{ ...channel, tvgId: null }], epg, "футбол")).toHaveLength(1);
    expect(searchProgrammes([channel], new Map([["name:спорт", [programme]]]), "футбол")).toHaveLength(1);
  });
  it("приоритет id не смешивает передачи другого канала с тем же именем", () => {
    expect(searchProgrammes([channel], new Map([["id:sport", []], ["name:спорт", [programme]]]), "футбол")).toEqual([]);
  });
  it("без запроса, EPG или каналов возвращает пустой список", () => {
    expect(searchProgrammes([channel], epg, "  ")).toEqual([]);
    expect(searchProgrammes([channel], null, "футбол")).toEqual([]);
    expect(searchProgrammes([], epg, "футбол")).toEqual([]);
    expect(searchProgrammes([channel], epg, "новости")).toEqual([]);
  });
  it("не ищет по описанию и по чужим каналам EPG", () => {
    expect(searchProgrammes([channel], new Map([["id:other", [programme]]]), "футбол")).toEqual([]);
    expect(searchProgrammes([channel], epg, "спорт")).toEqual([]);
  });
  it("сортирует передачи по времени, не изменяя исходный индекс", () => {
    const later = { ...programme, start: "2026-09-30T14:00:00Z", stop: "2026-09-30T16:00:00Z" };
    const list = [later, programme];
    expect(searchProgrammes([channel], new Map([["id:sport", list]]), "футбол").map((m) => m.programme)).toEqual([programme, later]);
    expect(list).toEqual([later, programme]);
  });
  it("пропускает некорректные интервалы", () => {
    const list = [{ ...programme, start: "invalid" }, { ...programme, stop: programme.start }];
    expect(searchProgrammes([channel], new Map([["id:sport", list]]), "футбол")).toEqual([]);
  });
});

describe("programmeArchiveUrl", () => {
  it("строит URL доступного архива", () => {
    expect(programmeArchiveUrl({ channel, programme }, now)).toBe(`https://example.test/archive/${Date.parse(programme.start) / 1000}/7200`);
  });
  it("эфир и будущее открываются как канал", () => {
    for (const at of ["2026-09-30T09:00:00Z", "2026-09-30T11:00:00Z"]) {
      expect(programmeArchiveUrl({ channel, programme }, new Date(at))).toBeNull();
    }
  });
  it("без шаблона, глубины или за пределами архива возвращает null", () => {
    expect(programmeArchiveUrl({ channel: { ...channel, catchupSource: null }, programme }, now)).toBeNull();
    expect(programmeArchiveUrl({ channel: { ...channel, catchupDays: 0 }, programme }, now)).toBeNull();
    expect(programmeArchiveUrl({ channel, programme }, new Date("2026-10-03T13:00:00Z"))).toBeNull();
  });
});
