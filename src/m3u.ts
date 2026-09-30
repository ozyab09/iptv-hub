import type { Channel, PlaylistSnapshot } from "./types";
import { parseCatchup } from "./catchup";
import { isPrivateHost } from "./config";

/**
 * Нормализация имени канала: нижний регистр, без эмодзи, quality-маркеров,
 * региональных суффиксов (+N, (N)) и мусорных разделителей.
 * Используется и для поиска, и для матчинга с EPG.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    // эмодзи, стрелки, звёзды, дингбаты, variation selector, ZWJ, keycap
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, " ")
    // quality-маркеры
    .replace(/\b(4k|uhd|fhd|hdtv|hd|sd|hdr|fd)\b/g, " ")
    // региональные/числовые суффиксы
    .replace(/\s*\(\d+\)\s*$/g, " ")
    .replace(/\s*\+\d+\s*$/g, " ")
    // доменные суффиксы вида "1-2-3.tv"
    .replace(/\s*[\w-]+\.tv\s*$/g, " ")
    .replace(/[|_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Качество из имени канала (приоритет 4K > FHD > HD > SD). */
export function detectQuality(
  name: string,
): Channel["quality"] {
  const u = name.toUpperCase();
  if (/\b(4K|UHD)\b/.test(u)) return "4K";
  if (/\bFHD\b/.test(u)) return "FHD";
  if (/\bHD(TV)?\b/.test(u)) return "HD";
  if (/\bSD\b/.test(u)) return "SD";
  return null;
}

const QUALITY_RANK: Record<NonNullable<Channel["quality"]>, number> = {
  "4K": 4,
  FHD: 3,
  HD: 2,
  SD: 1,
};

/** Извлечение атрибута из строки атрибутов #EXTINF. */
export function extractAttr(attrs: string, key: string): string | null {
  const re = new RegExp(`${key}="([^"]*)"`, "i");
  const m = attrs.match(re);
  return m?.[1] ?? null;
}

/**
 * Канал с http:// на публичном хосте с https-страницы играть не может:
 * браузер блокирует mixed content до сети, и никакие retry это не чинят.
 * Раньше такие каналы лежали в списке наравне с рабочими, и пользователь
 * натыкался на них клик за кликом, получая тост об ошибке. Теперь они
 * отбрасываются при разборе, но не молча — countDroppedHttp отдаёт число
 * для тоста после загрузки плейлиста.
 *
 * Локальные и приватные хосты (localhost, *.local, RFC1918) остаются:
 * mixed content на них не действует, домашние IPTV-серверы играют.
 */
export function isPlayableStreamUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    if (u.protocol !== "http:") return true; // rtmp/udp/… не трогаем
    return isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

/** Разбор M3U-контента в снимок плейлиста. */
export function parseM3U(content: string): PlaylistSnapshot {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  const seenUrls = new Set<string>();
  let headerTvgUrl: string | null = null;
  let droppedHttp = 0;
  let pending: {
    attrs: string;
    name: string;
    extras: string[];
  } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTM3U")) {
      headerTvgUrl =
        extractAttr(line, "tvg-url") ?? extractAttr(line, "url-tvg");
      continue;
    }

    if (line.startsWith("#EXTINF")) {
      const commaIdx = line.indexOf(",");
      const head =
        commaIdx >= 0 ? line.slice(0, commaIdx) : line;
      const name =
        commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "";
      pending = { attrs: head, name, extras: [] };
      continue;
    }

    if (line.startsWith("#")) {
      // #EXTVLCOPT / #KODIPROP / прочие директивы — привязываем к текущему entry
      pending?.extras.push(line);
      continue;
    }

    // первая непрокомментированная строка после #EXTINF — URL потока
    if (pending) {
      if (!/^[\w-]+:\/\//.test(line)) {
        pending = null; // мусор без схемы — entry отбрасываем
        continue;
      }
      if (seenUrls.has(line)) {
        pending = null; // дедуп по URL: первый вариант выигрывает
        continue;
      }
      seenUrls.add(line); // до проверки http: дубликат не считает скрытым второй раз
      if (!isPlayableStreamUrl(line)) {
        droppedHttp++; // http-канал на публичном хосте — в браузере не заиграет
        pending = null;
        continue;
      }

      const name = pending.name || "Без названия";
      const catchupInfo = parseCatchup(
        extractAttr(pending.attrs, "tvg-rec"),
        extractAttr(pending.attrs, "catchup-days"),
        extractAttr(pending.attrs, "catchup"),
        extractAttr(pending.attrs, "catchup-source"),
      );
      channels.push({
        name,
        normalizedName: normalizeName(name),
        url: line,
        tvgId: extractAttr(pending.attrs, "tvg-id"),
        logo: extractAttr(pending.attrs, "tvg-logo"),
        group: extractAttr(pending.attrs, "group-title") ?? "Основные",
        quality: detectQuality(name),
        catchupDays: catchupInfo.days,
        catchupSource: catchupInfo.source,
      });
      pending = null;
    }
  }

  channels.sort((a, b) =>
    a.name.localeCompare(b.name, "ru", { sensitivity: "base" }),
  );

  const categories = [...new Set(channels.map((c) => c.group))].sort((a, b) =>
    a.localeCompare(b, "ru", { sensitivity: "base" }),
  );

  return { channels, categories, headerTvgUrl, droppedHttp };
}

export { QUALITY_RANK };
