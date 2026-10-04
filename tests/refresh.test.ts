import { describe, it, expect } from "vitest";
import {
  parseInterval,
  loadInterval,
  saveInterval,
  shouldCheck,
  diffSnapshots,
  refreshNotice,
  checkSummary,
  countProgrammes,
  REFRESH_CHOICES,
} from "../src/refresh";
import type { EpgProgramme } from "../src/types";
import type { Channel, PlaylistSnapshot } from "../src/types";
import { memoryStorage as store } from "./fakes/storage";


const ch = (url: string, name = "Канал"): Channel => ({
  name,
  normalizedName: name.toLowerCase(),
  url,
  tvgId: null,
  logo: null,
  group: "Основные",
  quality: null,
  catchupDays: 0,
  catchupSource: null,
});

const snap = (channels: Channel[]): PlaylistSnapshot => ({
  channels,
  categories: [...new Set(channels.map((c) => c.group))],
  headerTvgUrl: null,
  droppedHttp: 0,
});

describe("refresh: интервал", () => {
  it("разбирает сохранённое значение, чужое — выключено", () => {
    expect(parseInterval("60")).toBe(60);
    expect(parseInterval("1440")).toBe(1440);
    expect(parseInterval("999")).toBe(0);
    expect(parseInterval(null)).toBe(0);
    expect(parseInterval("кря")).toBe(0);
  });

  it("сохраняется и читается назад; без storage — выключено", () => {
    const s = store();
    saveInterval(360, s);
    expect(loadInterval(s)).toBe(360);
    expect(loadInterval(null)).toBe(0);
  });

  it("выбор периодичности консистентен с парсером", () => {
    for (const c of REFRESH_CHOICES) {
      expect(parseInterval(String(c.value))).toBe(c.value);
    }
  });
});

describe("refresh: пора ли проверять", () => {
  const H = 3_600_000;

  it("выключенный интервал — никогда", () => {
    expect(shouldCheck(H, 0, 0)).toBe(false);
  });

  it("ни разу не проверявшийся — сразу", () => {
    expect(shouldCheck(H, 0, 60)).toBe(true);
  });

  it("по прошествии интервала — да, раньше — нет", () => {
    expect(shouldCheck(H, H - 60_000, 60)).toBe(false);
    expect(shouldCheck(H, H - H, 60)).toBe(true);
    expect(shouldCheck(H * 25, H, 1440)).toBe(true);
  });

  it("возврат из долгого фона: пора, из короткого — нет (#115)", () => {
    // Ушли в фон сразу после проверки, вернулись через 3 часа при интервале
    // «каждый час» — проверяем немедленно, не дожидаясь минутного тика.
    expect(shouldCheck(H * 3, H, 60)).toBe(true);
    // Мельком ушли и вернулись через минуту — ничего не делаем.
    expect(shouldCheck(H + 60_000, H, 60)).toBe(false);
    // Выключенная периодичность — и из фона не проверяем.
    expect(shouldCheck(H * 5, H, 0)).toBe(false);
  });
});

describe("refresh: разница снапшотов", () => {
  it("считает добавленные, удалённые и изменённые каналы", () => {
    const before = snap([ch("https://a/1", "Раз"), ch("https://a/2", "Два")]);
    const after = snap([ch("https://a/1", "Раз"), ch("https://a/2", "Два-новое"), ch("https://a/3", "Три")]);
    expect(diffSnapshots(before, after)).toEqual({ added: 1, removed: 0, changed: 1 });

    const gone = snap([ch("https://a/1", "Раз")]);
    expect(diffSnapshots(before, gone)).toEqual({ added: 0, removed: 1, changed: 0 });
  });

  it("одинаковые снапшоты — нули", () => {
    const s = snap([ch("https://a/1")]);
    expect(diffSnapshots(s, s)).toEqual({ added: 0, removed: 0, changed: 0 });
  });
});

describe("refresh: итог проверки для колокольчика", () => {
  it("с дельтой и программой", () => {
    expect(checkSummary({ added: 3, removed: 1, changed: 0 }, 1371, 22400, true)).toBe(
      "Плейлист обновлён: +3, −1. Каналов: 1371, передач: 22400",
    );
  });

  it("без изменений — подтверждение и числа", () => {
    expect(checkSummary({ added: 0, removed: 0, changed: 0 }, 500, 0, false)).toBe(
      "Плейлист проверён: без изменений. Каналов: 500, передач нет",
    );
  });

  it("countProgrammes суммирует длины списков", () => {
    const epg = new Map<string, EpgProgramme[]>([
      ["id:a", [prog(), prog()]],
      ["id:b", [prog()]],
      ["id:c", []],
    ]);
    expect(countProgrammes(epg)).toBe(3);
    expect(countProgrammes(new Map())).toBe(0);
  });
});

function prog(): EpgProgramme {
  return {
    start: "2026-09-30T10:00:00Z",
    stop: "2026-09-30T11:00:00Z",
    title: "Передача",
    desc: null,
  };
}

describe("refresh: текст уведомления", () => {
  it("builds English summaries and notices directly in the requested language", () => {
    const diff = { added: 3, removed: 1, changed: 2 };
    expect(checkSummary(diff, 20, 50, true, "en")).toBe("Playlist updated: +3, −1, changed: 2. Channels: 20, programmes: 50");
    expect(checkSummary({ added: 0, removed: 0, changed: 0 }, 20, 0, false, "en")).toBe("Playlist checked: no changes. Channels: 20, no programmes");
    expect(refreshNotice(diff, 5, "en")).toBe("Playlist updated: +3, −1, changed: 2. Hidden HTTP channels: 5");
    expect(refreshNotice({ added: 0, removed: 0, changed: 0 }, 5, "en")).toBe("Playlist updated. Hidden HTTP channels: 5");
  });
  it("без изменений — короткое подтверждение", () => {
    expect(refreshNotice({ added: 0, removed: 0, changed: 0 }, 0)).toBe(
      "Плейлист проверён: без изменений",
    );
  });

  it("перечисляет дельту и скрытые http", () => {
    expect(refreshNotice({ added: 3, removed: 1, changed: 2 }, 0)).toBe(
      "Плейлист обновлён: +3, −1, изменено: 2",
    );
    expect(refreshNotice({ added: 0, removed: 0, changed: 0 }, 5)).toBe(
      "Плейлист обновлён. Скрыто http-каналов: 5",
    );
  });
});
