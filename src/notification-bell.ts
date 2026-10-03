/**
 * UI центра уведомлений — DOM-слой поверх чистого notifications.ts (issue #123).
 *
 * Модуль получает готовые DOM-узлы и колбэки (открытие/закрытие оверлея,
 * запись в history) через init и потому сам остаётся тестируемым по логике:
 * DOM-операции локальны, состояние уведомлений живёт в чистом модуле.
 */
import {
  addNotification,
  loadNotifications,
  markAllRead,
  nextId,
  saveNotifications,
  unreadCount,
  type Notification,
  type NotificationWatch,
} from "./notifications";
import { t, translateMessage, type Language } from "./i18n";

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export interface NotifBellOptions {
  badge: HTMLElement;
  list: HTMLElement;
  storage: KV;
  /** Вызывается при открытии панели: записать оверлей в стек + history. */
  onOpen: () => void;
  /** Вызывается, когда панель надо закрыть извне (клик мимо). */
  onClose: () => void;
  now?: () => number;
  language?: () => Language;
  onWatch?: (target: NotificationWatch) => void;
}

/** Подпись времени уведомления: «12 фев, 09:41». Чистая функция. */
export function formatNotifTime(at: number, loc = "ru"): string {
  return new Date(at).toLocaleString(loc, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function createNotificationBell(opts: NotifBellOptions) {
  let items: Notification[] = loadNotifications(opts.storage);

  /** Свежие уведомления поднимают бейдж на колокольчике. */
  function render(): void {
    const language = opts.language?.() ?? "ru";
    const unread = unreadCount(items);
    opts.badge.hidden = unread === 0;
    opts.badge.textContent = unread > 9 ? "9+" : String(unread);
    opts.list.textContent = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "notif-empty";
      empty.textContent = t("notifications.empty", language);
      opts.list.append(empty);
      return;
    }
    for (const item of items) {
      const row = document.createElement("div");
      row.className = item.read ? "notif-item" : "notif-item unread";
      const time = document.createElement("span");
      time.className = "n-time num";
      time.textContent = formatNotifTime(item.at, language);
      const text = document.createElement("span");
      text.textContent = translateMessage(item.text, language); // только textContent
      row.append(time, text);
      if (item.watch && opts.onWatch) {
        const watch = document.createElement("button");
        watch.type = "button"; watch.className = "btn btn-sm notification-watch";
        watch.textContent = t("reminder.watch", language);
        watch.addEventListener("click", () => opts.onWatch!(item.watch!));
        row.append(watch);
      }
      opts.list.append(row);
    }
  }

  function persist(): void {
    saveNotifications(items, opts.storage);
  }
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === "iptv-hub.notifications.v1") { items = loadNotifications(opts.storage); render(); }
  });

  return {
    /** Положить уведомление в колокольчик (данные + бейдж). */
    push(message: string, watch?: NotificationWatch): void {
      const now = opts.now ?? Date.now;
      if (opts.storage) items = loadNotifications(opts.storage);
      items = addNotification(items, nextId(items), message, now(), watch);
      persist();
      render();
    },
    /** Колокольчик нажат: открыть панель и пометить всё прочитанным. */
    open(): void {
      opts.onOpen();
      items = markAllRead(items);
      persist();
      render();
    },
    /** Очистить историю («Очистить»). */
    clear(): void {
      items = [];
      persist();
      render();
    },
    /** Перерисовать (например, при возврате видимости). */
    render,
    get items(): readonly Notification[] {
      return items;
    },
  };
}
