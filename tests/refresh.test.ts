import { describe, it, expect } from "vitest";
import {
  parseInterval,
  loadInterval,
  saveInterval,
  shouldCheck,
  diffSnapshots,
  refreshNotice,
  REFRESH_CHOICES,
} from "../src/refresh";
import type { Channel, PlaylistSnapshot } from "../src/types";

const store = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
};

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

describe("refresh: текст уведомления", () => {
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
