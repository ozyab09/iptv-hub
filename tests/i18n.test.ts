import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { en, resolveLanguage, ru, t, translateMessage, type TranslationKey } from "../src/i18n";

describe("i18n", () => {
  it("all static HTML translation keys exist in the dictionaries", () => {
    const html = readFileSync("index.html", "utf8");
    for (const match of html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)) {
      expect(Object.hasOwn(ru, match[1]!), match[1]).toBe(true);
    }
  });
  it("синхронизирует ключи и параметры ru/en", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
    for (const key of Object.keys(ru) as TranslationKey[]) {
      expect(en[key].match(/\{\w+\}/g)?.sort() ?? []).toEqual(ru[key].match(/\{\w+\}/g)?.sort() ?? []);
      expect(en[key].trim()).not.toBe("");
    }
  });
  it.each([
    [null, "ru-RU", "ru"], [null, "RU", "ru"], [null, "en-US", "en"],
    [null, "de-DE", "en"], ["ru", "en-US", "ru"], ["en", "ru-RU", "en"],
    ["broken", "ru-RU", "ru"],
  ] as const)("выбирает язык %s/%s", (saved, browser, expected) => {
    expect(resolveLanguage(saved, browser)).toBe(expected);
  });
  it("перевод чистый и не меняет параметры", () => {
    const params = Object.freeze({ name: "Настройки {name} <b>" });
    expect(t("playlist.edit", "en", params)).toBe("Edit “Настройки {name} <b>”");
    expect(t("settings.title")).toBe("Настройки");
    expect(t("settings.title", "en")).toBe("Settings");
    expect(t("settings.title")).toBe("Настройки");
  });
  it("переводит сохранённые уведомления и вложенную сводку", () => {
    const message = "Плейлист обновлён: +2, изменено: 1. Каналов: 20, передач: 50";
    const translated = translateMessage(message, "en");
    expect(translated).toBe("Playlist updated: +2, changed: 1. Channels: 20, programmes: 50");
    expect(translateMessage(translated, "ru")).toBe(message);
    expect(translateMessage("Сбой сети — переподключаемся (1/3)…", "en")).toBe("Network error; reconnecting (1/3)…");
  });
  it("сохраняет имена, неизвестный текст и спецсимволы", () => {
    expect(translateMessage("Изменить «Настройки»", "en")).toBe("Edit “Настройки”");
    expect(translateMessage("Что? Где? Когда? <b>{x}</b>", "en")).toBe("Что? Где? Когда? <b>{x}</b>");
    expect(translateMessage(ru["probe.cors"], "en")).toBe(en["probe.cors"]);
  });
});
