import { type Language } from "./i18n";
import type { Channel, EpgProgramme, NowNext, PlaylistSnapshot } from "./types";
import { withSourceTimeout } from "./source-timeout";
import { normalizeName } from "./m3u";
import { mergeEpgSources } from "./epg-sources";
import { sourceEpgKey } from "./playlist-aggregate";

/** Идентификатор канала для матчинга с EPG (tvg-id, иначе нормализованное имя). */
export function channelEpgKey(c: Channel, byName = false): string {
  const key = !byName && c.tvgId ? `id:${c.tvgId.toLowerCase()}` : `name:${c.normalizedName}`;
  return c.source ? sourceEpgKey(c.source.id, key) : key;
}

/** Загрузка и стриминговый разбор XMLTV (обычный или .gz). */
export async function loadEpg(
  url: string,
  onProgress?: (pct: number) => void,
): Promise<Map<string, EpgProgramme[]>> {
  return withSourceTimeout(async (signal) => {
    const resp = await fetch(url, { signal });
    if (!resp.ok) {
      throw new Error(`EPG HTTP ${resp.status}`);
    }
    const total = Number(resp.headers.get("content-length") ?? 0);

    let buffer: ArrayBuffer;
    if (resp.body && total > 0) {
      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onProgress?.(Math.min(99, Math.round((received / total) * 100)));
      }
      const merged = new Uint8Array(received);
      let off = 0;
      for (const ch of chunks) {
        merged.set(ch, off);
        off += ch.byteLength;
      }
      buffer = merged.buffer;
      onProgress?.(100);
    } else {
      buffer = await resp.arrayBuffer();
      onProgress?.(100);
    }

    let xml: string;
    const magic = new Uint8Array(buffer.slice(0, 2));
    if (magic[0] === 0x1f && magic[1] === 0x8b) {
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([buffer]).stream().pipeThrough(ds);
      xml = await new Response(stream).text();
    } else {
      xml = new TextDecoder("utf-8").decode(buffer);
    }

    return parseEpg(xml);
  });
}

/** Независимые загрузки идут параллельно; ошибка одного источника не теряет другие. */
export async function loadEpgSources(
  urls: readonly string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, EpgProgramme[]>> {
  let completed = 0;
  onProgress?.(0, urls.length);
  const results = await Promise.allSettled(urls.map(async (url) => {
    try { return await loadEpg(url); }
    finally { onProgress?.(++completed, urls.length); }
  }));
  const sources = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (urls.length && !sources.length) throw new Error("EPG sources unavailable");
  return mergeEpgSources(sources);
}

/**
 * Разбор XMLTV. Ключ — lowercase tvg-id ИЛИ lowercase display-name канала
 * (как есть и нормализованный normalizeName): матчинг делается на обоих
 * уровнях, чтобы работать и с плейлистами без tvg-id.
 */
export function parseEpg(xml: string): Map<string, EpgProgramme[]> {
  const byKey = new Map<string, EpgProgramme[]>();

  // id канала → первый lowercase display-name (для матчинга по имени)
  const idToName = new Map<string, string>();
  const channelIdRe = /<channel\s+id="([^"]*)"\s*>([\s\S]*?)<\/channel\s*>/g;
  for (const m of xml.matchAll(channelIdRe)) {
    const id = (m[1] ?? "").toLowerCase();
    const body = m[2] ?? "";
    const nameRe = /<display-name>([^<]*)<\/display-name>/g;
    for (const nm of body.matchAll(nameRe)) {
      const name = (nm[1] ?? "").trim().toLowerCase();
      if (name && id && !idToName.has(id)) idToName.set(id, name);
    }
  }

  const RE = /<programme\s+([^>]*?)>([\s\S]*?)<\/programme\s*>/g;
  // Имя атрибута — от границы: иначе vps-start="…"/pdc-start="…" из XMLTV
  // читались бы как start (#361).
  const attr = (s: string, k: string): string | null =>
    s.match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`))?.[1] ?? null;

  for (const m of xml.matchAll(RE)) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const chId = attr(attrs, "channel") ?? "";
    const start = parseXmltvDate(attr(attrs, "start") ?? "");
    const stop = parseXmltvDate(attr(attrs, "stop") ?? "");
    const title = body.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? "";
    const desc = body.match(/<desc[^>]*>([^<]*)<\/desc>/)?.[1] ?? null;
    if (!start || !stop || !chId) continue;

    const prog: EpgProgramme = {
      start: start.toISOString(),
      stop: stop.toISOString(),
      title: decodeEntities(title),
      desc: desc ? decodeEntities(desc) : null,
    };

    // индексируем и по id, и по всем известным именам канала
    push(byKey, `id:${chId.toLowerCase()}`, prog);
    // Имя — и как есть, и через normalizeName(): канал без tvg-id ищется
    // по своему normalizedName («Футбол HD» → «футбол», #348).
    const display = idToName.get(chId.toLowerCase());
    if (display) {
      push(byKey, `name:${display}`, prog);
      const normalized = normalizeName(display);
      if (normalized && normalized !== display) push(byKey, `name:${normalized}`, prog);
    }
  }

  return byKey;
}

function push(
  map: Map<string, EpgProgramme[]>,
  key: string,
  prog: EpgProgramme,
): void {
  const arr = map.get(key);
  if (arr) arr.push(prog);
  else map.set(key, [prog]);
}

/** XMLTV date: 20240101120000 +0300 → Date. */
export function parseXmltvDate(s: string): Date | null {
  const m = s.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, sec, tz] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${sec ?? "00"}${
    tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "Z"
  }`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (raw: string, d: string) => fromCodePointSafe(Number(d), raw))
    .replace(/&#x([0-9a-f]+);/gi, (raw: string, h: string) => fromCodePointSafe(parseInt(h, 16), raw))
    .replace(/&amp;/g, "&");
}

/**
 * Символ по коду или исходная сущность, если код вне Unicode или суррогат:
 * одна битая сущность провайдера не должна ронять весь EPG (#352).
 */
function fromCodePointSafe(code: number, raw: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return raw;
  return String.fromCodePoint(code);
}

/** «Сейчас / далее» для канала с учётом локального времени. */
export function getNowNext(
  epg: Map<string, EpgProgramme[]>,
  channel: Channel,
  snapshot: PlaylistSnapshot,
  at: Date = new Date(),
): NowNext {
  void snapshot;
  const key = channelEpgKey(channel);
  const list = epg.get(key);
  if (!list || list.length === 0) return { now: null, next: null };

  const t = at.getTime();
  let now: EpgProgramme | null = null;
  let next: EpgProgramme | null = null;
  for (const p of list) {
    const start = Date.parse(p.start);
    const stop = Date.parse(p.stop);
    if (start <= t && t < stop) now = p;
    else if (start > t && (!next || start < Date.parse(next.start))) next = p;
  }
  return { now, next };
}

/** Форматирование интервала «14:30–15:00». */
export function formatRange(p: EpgProgramme, language: Language = "ru"): string {
  const fmt = new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(Date.parse(p.start))}–${fmt.format(Date.parse(p.stop))}`;
}
