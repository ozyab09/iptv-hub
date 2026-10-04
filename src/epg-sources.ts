import type { EpgProgramme } from "./types";

export const MAX_ADDITIONAL_EPG_SOURCES = 3;

/** Дополнительные источники: только сетевые URL, без дублей, максимум три. */
export function parseEpgSources(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value.flatMap((item): string[] => {
    if (typeof item !== "string") return [];
    try {
      const url = new URL(item.trim());
      return url.protocol === "http:" || url.protocol === "https:" ? [url.href] : [];
    } catch { return []; }
  });
  return [...new Set(urls)].slice(0, MAX_ADDITIONAL_EPG_SOURCES);
}

/** Поле формы: до трёх URL через пробелы, ошибку не скрываем санитаризацией. */
export function epgSourcesInput(raw: string): string[] | null {
  const urls = raw.trim().split(/\s+/).filter(Boolean);
  if (urls.length > MAX_ADDITIONAL_EPG_SOURCES || urls.some((url) => !parseEpgSources([url]).length)) return null;
  return parseEpgSources(urls);
}

/** Явный источник, дополнительные, затем заголовок M3U; каждый URL один раз. */
export function epgSourceUrls(primary: string | null, additional: readonly string[], header: string | null): string[] {
  return [...new Set([primary, ...additional, header].filter((url): url is string => !!url))];
}

/** Для каждого ключа выигрывает первый непустой список, входные карты не меняем. */
export function mergeEpgSources(sources: readonly ReadonlyMap<string, EpgProgramme[]>[]): Map<string, EpgProgramme[]> {
  const result = new Map<string, EpgProgramme[]>();
  for (const source of sources) {
    for (const [key, programmes] of source) {
      if (programmes.length && !result.get(key)?.length) result.set(key, programmes);
    }
  }
  return result;
}
