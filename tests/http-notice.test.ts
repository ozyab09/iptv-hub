import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldShowHttpNotice,
  markHttpNoticeShown,
  __resetHttpNotice,
} from "../src/http-notice";

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

describe("http-notice: один показ на плейлист", () => {
  beforeEach(() => __resetHttpNotice());

  it("первый раз показывает, после отметки — нет", () => {
    const s = store();
    expect(shouldShowHttpNotice("pl1", s)).toBe(true);
    markHttpNoticeShown("pl1", s);
    expect(shouldShowHttpNotice("pl1", s)).toBe(false);
  });

  it("плейлисты учитываются независимо", () => {
    const s = store();
    markHttpNoticeShown("pl1", s);
    expect(shouldShowHttpNotice("pl1", s)).toBe(false);
    expect(shouldShowHttpNotice("pl2", s)).toBe(true);
  });

  it("переживает «перезагрузку страницы» (состояние в storage)", () => {
    const s = store();
    markHttpNoticeShown("pl1", s);
    __resetHttpNotice(); // имитация новой страницы: память очищена
    expect(shouldShowHttpNotice("pl1", s)).toBe(false);
    expect(s.getItem("iptv-hub.http-notice.v1")).toBe(JSON.stringify(["pl1"]));
  });

  it("повторная отметка не дублирует ключ в storage", () => {
    const s = store();
    markHttpNoticeShown("pl1", s);
    markHttpNoticeShown("pl1", s);
    expect(s.getItem("iptv-hub.http-notice.v1")).toBe(JSON.stringify(["pl1"]));
  });

  it("без storage работает в рамках сеанса", () => {
    expect(shouldShowHttpNotice("pl1", null)).toBe(true);
    markHttpNoticeShown("pl1", null);
    expect(shouldShowHttpNotice("pl1", null)).toBe(false);
  });

  it("битый JSON в storage не роняет загрузку", () => {
    const s = store();
    s.setItem("iptv-hub.http-notice.v1", "{битый json");
    expect(shouldShowHttpNotice("pl1", s)).toBe(true);
  });
});
