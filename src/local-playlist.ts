/**
 * Локальный плейлист из файла (FR-10): содержимое .m3u (и опционально EPG)
 * хранится в OPFS, файл не покидает устройство.
 *
 * Чистая логика над инъекцией OPFS-подобного хранилища — тестируется в node
 * с фейковым handle. Модель Playlist с http(s)-URL не ломается: локальному
 * источнику playlistUrl не присваивается, отличительный признак — наличие
 * записи в OPFS под ключом `local:<id>`.
 */

export interface LocalFs {
  /** Прочитать файл целиком или null, если файла нет. */
  read: (key: string) => Promise<string | null>;
  /** Записать файл. */
  write: (key: string, content: string) => Promise<void>;
  /** Удалить файл. */
  remove: (key: string) => Promise<void>;
}

/** Ключ содержимого плейлиста локального источника. */
export function localKey(id: string): string {
  return `local:${id}`;
}

/** Сохранить .m3u (и EPG) локального плейлиста. */
export async function saveLocalPlaylist(
  fs: LocalFs,
  id: string,
  m3u: string,
  epg: string | null,
): Promise<void> {
  await fs.write(localKey(id), m3u);
  if (epg !== null) await fs.write(`${localKey(id)}:epg`, epg);
}

/** Прочитать .m3u локального плейлиста или null (не локальный/удалён). */
export function loadLocalPlaylist(fs: LocalFs, id: string): Promise<string | null> {
  return fs.read(localKey(id));
}

/** Удалить содержимое локального плейлиста (при удалении источника). */
export async function removeLocalPlaylist(fs: LocalFs, id: string): Promise<void> {
  await fs.remove(localKey(id));
  await fs.remove(`${localKey(id)}:epg`);
}

/**
 * Мини-валидация .m3u перед сохранением: не тащим в OPFS мусор.
 * Требуем #EXTM3U-заголовок и хотя бы один #EXTINF.
 */
export function looksLikeM3U(content: string): boolean {
  return content.includes("#EXTM3U") && content.includes("#EXTINF");
}

/** Пример безопасного имени: служебные символы схлопываются. */
export function defaultLocalName(fileName: string): string {
  const base = fileName.replace(/\.(m3u8?|txt)$/i, "").trim();
  return base || "Локальный плейлист";
}
