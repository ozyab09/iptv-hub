import { describe, expect, it } from "vitest";
import { nowHeaderFor } from "../src/now-header";
import type { Channel } from "../src/types";

const base: Channel = {
  name: "Первый канал",
  normalizedName: "первый канал",
  url: "https://cdn.example/1.m3u8",
  tvgId: "one",
  logo: "",
  group: "Новости",
  catchupDays: 0,
  catchupSource: null,
  quality: null,
};

describe("nowHeaderFor (#253)", () => {
  it("канал → имя, ссылка потока и категория", () => {
    expect(nowHeaderFor(base)).toEqual({
      title: "Первый канал",
      href: "https://cdn.example/1.m3u8",
      category: "Новости",
    });
  });

  it("архив → суффикс «· архив» и URL архива в тултипе", () => {
    const header = nowHeaderFor(base, "https://cdn.example/arch.ts?utc=1");
    expect(header.title).toBe("Первый канал · архив");
    expect(header.href).toBe("https://cdn.example/arch.ts?utc=1");
    expect(header.category).toBe("Новости");
  });

  it("нет канала (выбрано пустое окно) → пустой заголовок, а не чужой", () => {
    expect(nowHeaderFor(null)).toEqual({ title: "", href: "", category: "" });
    expect(nowHeaderFor(null, "https://cdn.example/arch.ts")).toEqual({
      title: "",
      href: "",
      category: "",
    });
  });
});
