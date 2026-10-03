import { describe, expect, it } from "vitest";
import { canHotkey } from "../src/hotkey-guard";

// Гард горячих клавиш (срез 1: S — скриншот, ←/→ — перемотка ±15 с):
// отлавливает клавиши, не ломая набор в полях ввода, модальных диалогах/меню,
// на настройках и во время записи.
describe("hotkey guard", () => {
  it("canHotkey — чистая функция, экспортируется", () => {
    expect(typeof canHotkey).toBe("function");
  });
});
