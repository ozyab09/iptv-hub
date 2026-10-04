export type Language = "ru" | "en";
export const LANGUAGE_KEY = "iptv-hub.language.v1";

import { ru, type TranslationKey } from "./i18n-ru";
import { en } from "./i18n-en";

// Словари живут в i18n-ru.ts / i18n-en.ts (#375); API перевода — здесь.
export { ru, en };
export type { TranslationKey };

export const dictionaries = { ru, en };
export type TranslationParams = Readonly<Record<string, string | number>>;

/** Чистый перевод: язык и значения задаются вызывающим кодом. */
export function t(key: TranslationKey, language: Language = "ru", params: TranslationParams = {}): string {
  return dictionaries[language][key].replace(/\{(\w+)\}/g, (token, name: string) =>
    params[name] === undefined ? token : String(params[name]));
}

/** Сохранённый язык приоритетен; остальные языки браузера используют en. */
export function resolveLanguage(saved: unknown, browserLanguage: string): Language {
  if (saved === "ru" || saved === "en") return saved;
  return /^ru(?:-|$)/i.test(browserLanguage) ? "ru" : "en";
}

/** Перевод сохранённых системных сообщений; неизвестные строки и данные не меняются. */
export function translateMessage(message: string, language: Language): string {
  for (const source of [ru, en]) {
    // Сначала составная сводка, затем её части с открытым параметром в конце.
    const keys: TranslationKey[] = ["refresh.summary", ...Object.keys(ru).filter((key) => key !== "refresh.summary") as TranslationKey[]];
    for (const key of keys) {
      const template = source[key];
      if (template === message) return t(key, language);
      if (!template.includes("{")) continue;
      const names: string[] = [];
      const pattern = template.split(/(\{\w+\})/g).map((part) => {
        if (/^\{\w+\}$/.test(part)) {
          names.push(part.slice(1, -1));
          return "([\\s\\S]*?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }).join("");
      const match = new RegExp(`^${pattern}$`).exec(message);
      if (!match) continue;
      const params: Record<string, string> = {};
      names.forEach((name, index) => {
        const value = match[index + 1]!;
        // Только вложенные системные части; имена плейлистов остаются дословными.
        params[name] = ["head", "epg", "reason", "hint"].includes(name)
          ? translateMessage(value, language)
          : name === "changes" ? value.split(", ").map((part) => translateMessage(part, language)).join(", ")
          : value;
      });
      return t(key, language, params);
    }
  }
  return message.includes("\n") ? message.split("\n").map((line) => translateMessage(line, language)).join("\n") : message;
}
