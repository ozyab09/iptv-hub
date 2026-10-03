import { describe, it, expect } from "vitest";
import {
  parseNotifications,
  loadNotifications,
  saveNotifications,
  addNotification,
  markAllRead,
  unreadCount,
  nextId,
  MAX_NOTIFICATIONS,
  type Notification,
} from "../src/notifications";

const store = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
};

const n = (id: number, text = "текст", read = false): Notification => ({
  id,
  text,
  at: 1_700_000_000_000 + id,
  read,
});

describe("notifications: парсинг", () => {
  it("persists reminder playback targets and ignores malformed targets", () => {
    const target = { playlistId: "one", channelUrl: "https://tv.test/live.m3u8" };
    const list = addNotification([], 1, "Film starts soon", 5, target);
    const storage = store();
    saveNotifications(list, storage);
    expect(loadNotifications(storage)[0]!.watch).toEqual(target);
    target.playlistId = "changed";
    expect(list[0]!.watch!.playlistId).toBe("one");
    expect(parseNotifications(JSON.stringify([{ ...n(1), watch: { playlistId: 42, channelUrl: "x" } }]))).toEqual([n(1)]);
  });
  it("читает валидный список, битое — пусто", () => {
    expect(parseNotifications(JSON.stringify([n(1)]))).toHaveLength(1);
    expect(parseNotifications("мусор")).toEqual([]);
    expect(parseNotifications(null)).toEqual([]);
    expect(parseNotifications(JSON.stringify({ x: 1 }))).toEqual([]);
    // элементы без обязательных полей отбрасываются, валидные остаются
    const mixed = JSON.stringify([n(1), { id: 2 }, "строка", null]);
    expect(parseNotifications(mixed)).toHaveLength(1);
  });
});

describe("notifications: добавление и лимит", () => {
  it("новые встают первыми", () => {
    const list = addNotification([n(1), n(2)], 3, "свежее", 5);
    expect(list[0]!.id).toBe(3);
    expect(list[0]!.read).toBe(false);
  });

  it("история обрезается до лимита", () => {
    let list: Notification[] = [];
    for (let i = 1; i <= MAX_NOTIFICATIONS + 5; i++) {
      list = addNotification(list, i, `уведомление ${i}`, i);
    }
    expect(list).toHaveLength(MAX_NOTIFICATIONS);
    expect(list[0]!.id).toBe(MAX_NOTIFICATIONS + 5); // свежие выжили
  });
});

describe("notifications: прочитанность и бейдж", () => {
  it("markAllRead гасит бейдж, новые снова поднимают", () => {
    let list = [n(1), n(2)];
    expect(unreadCount(list)).toBe(2);
    list = markAllRead(list);
    expect(unreadCount(list)).toBe(0);
    list = addNotification(list, 3, "новое", 3);
    expect(unreadCount(list)).toBe(1);
  });

  it("nextId не переиспользует существующие", () => {
    expect(nextId([n(7), n(3)])).toBe(8);
    expect(nextId([])).toBe(1);
  });
});

describe("notifications: storage", () => {
  it("переживает перезагрузку; пустой список удаляет ключ", () => {
    const s = store();
    const list = addNotification([], 1, "привет", 1);
    saveNotifications(list, s);
    expect(loadNotifications(s)).toEqual(list);
    saveNotifications([], s);
    expect(s.getItem("iptv-hub.notifications.v1")).toBeNull();
  });

  it("без storage деградирует в память сеанса", () => {
    expect(loadNotifications(null)).toEqual([]);
  });
});
