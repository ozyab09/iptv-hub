/**
 * Одноразовое уведомление о скрытых http-каналах.
 *
 * Тост жил 3,5 секунды — переписать «замените ссылки» за это время
 * невозможно. Полноценное уведомление наверху справа, с колокольчиком,
 * читается без спешки и закрывается крестиком, но показывается ОДИН раз
 * на плейлист: пользователь уже знает, при переключениях туда-обратно
 * оно стало бы спамом.
 *
 * Без DOM/fetch — это чистый модуль, тестируемый в node (принцип проекта).
 */

const STORAGE_KEY = "iptv-hub.http-notice.v1";

/** Прочитанные ключи (id активного плейлиста). Ленивая загрузка из storage. */
let seen = new Set<string>();
let loaded = false;

function load(storage: Storage | null): void {
  if (loaded) return;
  loaded = true;
  if (!storage) return;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) seen = new Set(JSON.parse(raw) as string[]);
  } catch {
    // битый JSON — считаем, что ничего не прочитано
  }
}

function save(storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    /* приватный режим / quota — молча */
  }
}

/**
 * Показывать ли уведомление для плейлиста id.
 *
 * Не показываем, если пользователь уже видел его для этого плейлиста
 * (или если скрытых каналов нет — это проверяет вызывающий).
 */
export function shouldShowHttpNotice(
  playlistId: string,
  storage: Storage | null,
): boolean {
  load(storage);
  return !seen.has(playlistId);
}

/** Отметить уведомление показанным (после фактического показа или закрытия). */
export function markHttpNoticeShown(
  playlistId: string,
  storage: Storage | null,
): void {
  load(storage);
  seen.add(playlistId);
  save(storage);
}

/** Сброс для тестов. */
export function __resetHttpNotice(): void {
  seen = new Set();
  loaded = false;
}
