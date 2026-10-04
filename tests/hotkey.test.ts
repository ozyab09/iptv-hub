import { afterEach, describe, expect, it, vi } from "vitest";
import { canHotkey, type HotkeyContext } from "../src/hotkey-guard";

// Гард горячих клавиш (срез 1: S — скриншот, ←/→ — перемотка ±15 с):
// отлавливает клавиши, не ломая набор в полях ввода, модальных диалогах/меню,
// на настройках и во время записи.
describe("hotkey guard", () => {
  it("canHotkey — чистая функция, экспортируется", () => {
    expect(typeof canHotkey).toBe("function");
  });
});

/** Минимальный document: фокус в поле ввода или нет; меню видимо или спрятано. */
function stubDocument(typing: boolean, menu: "none" | "hidden" | "visible" = "hidden"): void {
  const listbox = { closest: () => (menu === "hidden" ? {} : null) };
  vi.stubGlobal("document", {
    activeElement: { closest: () => (typing ? {} : null) },
    querySelector: () => null,
    querySelectorAll: () => (menu === "none" ? [] : [listbox]),
  });
}

function ctx(): HotkeyContext {
  return {
    playerBar: { hidden: false, classList: { contains: () => true } } as unknown as HTMLElement,
    activeView: "channels",
    isCompact: () => false,
    showsChannelList: () => true,
  };
}

// #346: клавиша S обрабатывается только через canHotkey — ввод «s»/«ы»
// в поле поиска не должен делать скриншот.
describe("hotkey guard: S в полях ввода (#346)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("при фокусе в input горячая клавиша не срабатывает", () => {
    stubDocument(true);
    expect(canHotkey(ctx())).toBe(false);
  });

  it("без фокуса в поле и при открытом плеере срабатывает", () => {
    stubDocument(false);
    expect(canHotkey(ctx())).toBe(true);
  });

  it("спрятанное меню (hidden) не блокирует, видимое — блокирует", () => {
    stubDocument(false, "none");
    expect(canHotkey(ctx())).toBe(true);
    stubDocument(false, "visible");
    expect(canHotkey(ctx())).toBe(false);
  });

  it("в main.ts один обработчик клавиши S, под гардом", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/main.ts", "utf8");
    expect(src.match(/takeScreenshot\(\);/g)?.length).toBe(1);
  });
});
