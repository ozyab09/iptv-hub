/**
 * Плейлист «извне» (#373): «Поделиться → IPTV Hub» (share_target),
 * «Открыть с помощью» для .m3u (file_handlers / Android intent) и
 * перетаскивание файла в окно. Чистые правила: какие параметры и файлы
 * принимаем. Импорт сводится к существующим путям — ссылка становится
 * `?p=` (upsert плейлиста), файл — локальным плейлистом в OPFS.
 */

/** Параметры share_target из манифеста (GET). */
const SHARE_PARAMS = ["url", "text", "title"] as const;

const URL_IN_TEXT = /https?:\/\/[^\s<>"'«»]+/i;

/** Первая http(s)-ссылка из поделённых url/text или null. */
export function sharedPlaylistUrl(params: URLSearchParams): string | null {
  const direct = params.get("url")?.trim() ?? "";
  if (/^https?:\/\//i.test(direct)) return direct;
  const match = URL_IN_TEXT.exec(params.get("text") ?? "");
  // Хвостовая пунктуация из сообщения («ссылка: https://…/a.m3u.») ссылке не принадлежит.
  return match ? match[0].replace(/[.,;:!?)\]]+$/, "") : null;
}

/**
 * Поделились ссылкой без `?p=`: адрес страницы, в котором ссылка стала `p`,
 * а параметры share_target убраны. null — переписывать нечего.
 */
export function shareTargetSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("p") || !SHARE_PARAMS.some((key) => params.has(key))) return null;
  const url = sharedPlaylistUrl(params);
  for (const key of SHARE_PARAMS) params.delete(key);
  if (url) params.set("p", url);
  const next = params.toString();
  return next ? `?${next}` : "";
}

/** Файл похож на плейлист по имени (.m3u/.m3u8). */
export function isPlaylistFileName(name: string): boolean {
  return /\.m3u8?$/i.test(name.trim());
}
