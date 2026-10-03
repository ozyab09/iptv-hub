import { describe, expect, it } from "vitest";

// Гард горячих клавиш (src/main.ts): отлавливает S (скриншот) и ←/→ (перемотка),
// при этом не срабатывает в поле ввода, в диалоге/меню, на настройках и записи
// и не перехватывает Ctrl+S. Код разделён в одном месте: `canHotkey()` + паттерн
// ключа в обработчике keydown.
describe("hotkey guard", () => {
  it("export canHotkey всегда доступен", () => {
    expect(typeof (globalThis as unknown as { canHotkey: unknown }).canHotkey).toBe("function");
  });
});
EOF
echo created