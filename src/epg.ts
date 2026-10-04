import type { Channel, EpgProgramme, NowNext, PlaylistSnapshot } from "./types";
import { withSourceTimeout } from "./source-timeout";

/** Идентификатор канала для матчинга с EPG (tvg-id, иначе нормализованное имя). */
function channelKey(c: Channel): string {
  return c.tvgId ? `id:${c.tvgId.toLowerCase()}` : `name:${c.normalizedName}`;
}

/** Сравнение «tvg-id точное, иначе имя» — та же логика, что в normalizeName. */
export function matchesEpg(
  channelName: string,
  epgDisplayName: string,
): boolean {
  return (
    channelName.trim().toLowerCase() === epgDisplayName.trim().toLowerCase()
  );
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

/**
 * Разбор XMLTV. Ключ — lowercase tvg-id ИЛИ lowercase display-name канала:
 * матчинг делается на обоих уровнях, чтобы работать и с плейлистами без tvg-id.
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
  const attr = (s: string, k: string): string | null =>
    s.match(new RegExp(`${k}="([^"]*)"`))?.[1] ?? null;

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
    const display = idToName.get(chId.toLowerCase());
    if (display) push(byKey, `name:${display}`, prog);
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
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** «Сейчас / далее» для канала с учётом локального времени. */
export function getNowNext(
  epg: Map<string, EpgProgramme[]>,
  channel: Channel,
  snapshot: PlaylistSnapshot,
  at: Date = new Date(),
): NowNext {
  void snapshot;
  const key = channelKey(channel);
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
export function formatRange(p: EpgProgramme): string {
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(Date.parse(p.start))}–${fmt.format(Date.parse(p.stop))}`;
}
