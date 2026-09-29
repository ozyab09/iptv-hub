/**
 * Тема оформления. Хранение — localStorage (privacy-first).
 * data-theme ставится на <html>; CSS определяет палитры через переменные.
 * Дефолт — системная тема (prefers-color-scheme), если пользователь не выбирал.
 */

export type Theme = "dark" | "light";

const THEME_KEY = "iptv-hub.theme.v1";

export type ThemeStorage = Pick<Storage, "getItem" | "setItem"> | null;

/** Валидная ли строка темы. */
export function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light";
}

/**
 * Итоговая тема:
 *   1. сохранённый выбор пользователя;
 *   2. системная (prefers-color-scheme), если доступен matchMedia;
 *   3. тёмная (дефолт бренда).
 */
export function resolveTheme(
  storage: ThemeStorage,
  prefersDark: boolean | null = null,
): Theme {
  if (storage) {
    try {
      const raw = storage.getItem(THEME_KEY);
      if (isTheme(raw)) return raw;
    } catch {
      // недоступный storage — идём в системную/дефолт
    }
  }
  if (prefersDark !== null) return prefersDark ? "dark" : "light";
  return "dark";
}

/** Противоположная тема. */
export function toggleTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

/** Сохранить выбор (best-effort). */
export function saveTheme(theme: Theme, storage: ThemeStorage): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // приватный режим — живём без персистентности
  }
}

/** Применить тему к документу: data-theme + color-scheme для нативных контролов. */
export function applyTheme(theme: Theme, doc: Document = document): void {
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.style.colorScheme = theme;
}

/** Синхронизировать иконку кнопки-переключателя: показывает целевую тему. */
export function themeButtonLabel(current: Theme): string {
  return current === "dark" ? "sun" : "moon";
}

export const THEME_STORAGE_KEY = THEME_KEY;
