/**
 * Центр уведомлений — данные и правила, без DOM.
 *
 * Колокольчик в шапке открывает панель со списком: клик по кнопке
 * помечает всё прочитанным, «Очистить» удаляет историю. Список переживает
 * перезагрузку (localStorage) и ограничен по длине — уведомления живут
 * в интерфейсе, а не сыпятся тостами.
 *
 * Чистый модуль (без DOM/fetch) — тестируется в node, принцип проекта.
 */

const STORAGE_KEY = "iptv-hub.notifications.v1";

export interface NotificationWatch { playlistId: string; channelUrl: string }

export interface Notification {
  /** Монотонный идентификатор в рамках хранилища. */
  id: number;
  /** Текст уведомления (уже собранный, на русском). */
  text: string;
  /** Время создания, мс epoch — для сортировки и подписи «сколько назад». */
  at: number;
  /** Прочитанным становится всё, что пользователь видел в панели. */
  read: boolean;
  /** A reminder can offer playback through the application's ordinary checks. */
  watch?: NotificationWatch;
}

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

/** Больше столько уведомлений не храним: это журнал, а не архив. */
export const MAX_NOTIFICATIONS = 20;

/** Разобрать сохранённый список: битое/чужое — пусто. */
export function parseNotifications(raw: string | null): Notification[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list: Notification[] = [];
    for (const n of parsed) {
      if (
        n &&
        typeof n === "object" &&
        typeof (n as Notification).id === "number" &&
        typeof (n as Notification).text === "string" &&
        typeof (n as Notification).at === "number"
      ) {
        const watch = (n as Notification).watch;
        list.push({
          id: (n as Notification).id,
          text: (n as Notification).text,
          at: (n as Notification).at,
          read: (n as Notification).read === true,
          ...(watch && typeof watch === "object" && typeof watch.playlistId === "string" && watch.playlistId &&
            typeof watch.channelUrl === "string" && watch.channelUrl ? { watch: { playlistId: watch.playlistId, channelUrl: watch.channelUrl } } : {}),
        });
      }
    }
    return list;
  } catch {
    return [];
  }
}

export function loadNotifications(storage: KV): Notification[] {
  if (!storage) return [];
  try {
    return parseNotifications(storage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveNotifications(list: Notification[], storage: KV): void {
  if (!storage) return;
  try {
    if (list.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* приватный режим / quota — молча */
  }
}

/**
 * Добавить уведомление наверх списка (новые первыми), обрезать по лимиту.
 * Возвращает новый список — модуль не мутирует чужие массивы.
 */
export function addNotification(
  list: Notification[],
  nextId: number,
  text: string,
  now: number,
  watch?: NotificationWatch,
): Notification[] {
  const item: Notification = { id: nextId, text, at: now, read: false, ...(watch ? { watch: { ...watch } } : {}) };
  return [item, ...list].slice(0, MAX_NOTIFICATIONS);
}

/** Прочитано всё, что есть. */
export function markAllRead(list: Notification[]): Notification[] {
  return list.map((n) => (n.read ? n : { ...n, read: true }));
}

/** Сколько непрочитанных — для бейджа на колокольчике. */
export function unreadCount(list: Notification[]): number {
  return list.reduce((sum, n) => sum + (n.read ? 0 : 1), 0);
}

/** Следующий свободный id: max(существующих) + 1. */
export function nextId(list: Notification[]): number {
  return list.reduce((max, n) => Math.max(max, n.id), 0) + 1;
}
