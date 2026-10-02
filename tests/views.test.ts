import { describe, it, expect } from "vitest";
import {
  channelsForView,
  filterVisibleGroups,
  channelsWord,
  groupDigits,
  DEFAULT_VIEW,
  emptyMessage,
  parseView,
  showsCategories,
  showsChannelList,
  VIEWS,
} from "../src/views";
import { ICONS } from "../src/icons";
import type { Channel } from "../src/types";

function ch(name: string, url: string, group = "Основные"): Channel {
  return {
    name,
    normalizedName: name.toLowerCase(),
    url,
    tvgId: null,
    logo: null,
    group,
    quality: null,
    catchupDays: 0,
    catchupSource: null,
  };
}

const a = ch("Первый", "http://a");
const b = ch("Второй", "http://b");
const c = ch("Третий", "http://c");
const all = [a, b, c];

describe("hidden groups", () => {
  const channels = [ch("News", "a", "News"), ch("Sports", "b", "Sports"), ch("News 2", "c", "News")];
  it("filters whole groups without modifying channel metadata or order", () => {
    expect(filterVisibleGroups(channels, new Set(["News"]))).toEqual([channels[1]]);
    expect(filterVisibleGroups(channels, new Set())).toEqual(channels);
    expect(channels).toHaveLength(3);
  });
  it("removes hidden favorites and recents before selecting a section", () => {
    const visible = filterVisibleGroups(channels, new Set(["News"]));
    for (const view of ["channels", "favorites", "recents"] as const) {
      expect(channelsForView(view, visible, new Set(["a", "b", "c"]), ["c", "a", "b"])).toEqual([channels[1]]);
    }
  });
  it("supports hiding all groups, exact names and unknown groups", () => {
    expect(filterVisibleGroups(channels, new Set(["News", "Sports"]))).toEqual([]);
    expect(filterVisibleGroups(channels, new Set(["news", "Unknown"]))).toEqual(channels);
  });
});

describe("состав разделов", () => {
  it("пять разделов в порядке дизайн-системы", () => {
    expect(VIEWS.map((v) => v.id)).toEqual([
      "channels",
      "favorites",
      "recents",
      "recordings",
      "settings",
    ]);
    expect(VIEWS.map((v) => v.label)).toEqual([
      "Каналы",
      "Избранное",
      "Недавние",
      "Записи",
      "Настройки",
    ]);
  });

  it("у каждого раздела есть существующая иконка", () => {
    for (const v of VIEWS) {
      expect(ICONS[v.icon], `нет иконки ${v.icon} для ${v.id}`).toBeDefined();
    }
  });
});

describe("parseView", () => {
  it("принимает известные разделы", () => {
    expect(parseView("favorites")).toBe("favorites");
    expect(parseView("settings")).toBe("settings");
  });

  it("мусор и пустота дают раздел по умолчанию", () => {
    // localStorage переживает обновления приложения: значение из старой
    // версии не должно оставлять пользователя на пустом экране.
    expect(parseView(null)).toBe(DEFAULT_VIEW);
    expect(parseView("")).toBe(DEFAULT_VIEW);
    expect(parseView("epg")).toBe(DEFAULT_VIEW);
    expect(parseView("__proto__")).toBe(DEFAULT_VIEW);
  });
});

describe("что показывает раздел", () => {
  it("список каналов есть везде, кроме настроек", () => {
    expect(showsChannelList("channels")).toBe(true);
    expect(showsChannelList("favorites")).toBe(true);
    expect(showsChannelList("recents")).toBe(true);
    expect(showsChannelList("settings")).toBe(false);
  });

  it("категории только в «Каналах»", () => {
    // В избранном и недавних фильтр по категории прятал бы половину
    // короткого списка без видимой причины.
    expect(showsCategories("channels")).toBe(true);
    expect(showsCategories("favorites")).toBe(false);
    expect(showsCategories("recents")).toBe(false);
  });
});

describe("channelsForView", () => {
  it("«Каналы» отдают всё", () => {
    expect(channelsForView("channels", all, new Set(), [])).toEqual(all);
  });

  it("«Избранное» отбирает по url", () => {
    const favs = new Set(["http://c", "http://a"]);
    expect(channelsForView("favorites", all, favs, []).map((x) => x.name)).toEqual([
      "Первый",
      "Третий",
    ]);
  });

  it("«Недавние» идут в порядке просмотра, а не алфавита", () => {
    const recents = ["http://c", "http://a"];
    expect(channelsForView("recents", all, new Set(), recents).map((x) => x.name)).toEqual(
      ["Третий", "Первый"],
    );
  });

  it("«Недавние» переживают исчезновение канала из плейлиста", () => {
    const recents = ["http://c", "http://gone", "http://a"];
    expect(
      channelsForView("recents", all, new Set(), recents).map((x) => x.name),
    ).toEqual(["Третий", "Первый"]);
  });

  it("настройки списка не имеют", () => {
    expect(channelsForView("settings", all, new Set(), ["http://a"])).toEqual([]);
  });

  it("не мутирует исходный список", () => {
    const copy = [...all];
    channelsForView("channels", all, new Set(), []).sort((x, y) =>
      x.name.localeCompare(y.name),
    );
    expect(all).toEqual(copy);
  });
});

describe("текст пустого состояния", () => {
  it("объясняет причину по разделу", () => {
    expect(emptyMessage("favorites", false)).toMatch(/^Пока ничего не в избранном\. .*звёздочку/);
    expect(emptyMessage("recents", false)).toMatch(/^Вы ещё ничего не смотрели\./);
  });

  it("при поиске причина в запросе, а не в разделе", () => {
    expect(emptyMessage("favorites", true)).toBe("Ничего не найдено");
    expect(emptyMessage("recents", true)).toBe("Ничего не найдено");
  });
});

describe("счётчик каналов", () => {
  it("склоняет слово по числу", () => {
    expect(channelsWord(1)).toBe("1 канал");
    expect(channelsWord(2)).toBe("2 канала");
    expect(channelsWord(5)).toBe("5 каналов");
    expect(channelsWord(11)).toBe("11 каналов");
    expect(channelsWord(22)).toBe("22 канала");
    expect(channelsWord(112)).toBe("112 каналов");
    expect(channelsWord(121)).toBe("121 канал");
  });

  it("разбивает разряды неразрывным тонким пробелом", () => {
    expect(channelsWord(1240)).toBe("1 240 каналов");
    expect(groupDigits(1240)).toBe("1 240");
    expect(groupDigits(999)).toBe("999");
  });
});
