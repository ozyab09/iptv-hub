/**
 * Гард горячих клавиш (срез 1: S — скриншот, ←/→ — перемотка ±15 с).
 *
 * Код собран в одном месте, чтобы не ловить клавиши в поле ввода,
 * в модальном диалоге/меню, на настройках/записи, на мини-плеере и
 * когда панель скрыта. Зависимости UI инъекцируются контекстом —
 * модуль остаётся чистым и тестируемым без DOM-магии.
 */

import type { View } from "./views";

/** Контекст UI, нужный гарду. Передаётся из main.ts при каждом вызове. */
export interface HotkeyContext {
  /** Элемент панели плеера. */
  playerBar: HTMLElement;
  /** Активный раздел приложения. */
  activeView: View;
  /** Компактный экран (ниже 1024px). */
  isCompact: () => boolean;
  /** Показывает ли раздел список каналов. */
  showsChannelList: (view: View) => boolean;
}

/** Можно ли сейчас обрабатывать горячие клавиши в интерфейсе. */
export function canHotkey(ctx: HotkeyContext): boolean {
  const focused = document.activeElement as HTMLElement | null;
  const typing = !!focused?.closest(
    "input, textarea, select, [contenteditable]:not([contenteditable=false])",
  );
  if (typing || isOverlayOpen()) return false;

  return (
    !ctx.playerBar.hidden &&
    ctx.showsChannelList(ctx.activeView) &&
    (!ctx.isCompact() || ctx.playerBar.classList.contains("open"))
  );
}

/**
 * Открыт ли верхний оверлей/модальный интерфейс. Меню и гайд живут в
 * разметке постоянно и прячутся атрибутом hidden (на себе или на обёртке) —
 * открытым считается только видимый (#346).
 */
function isOverlayOpen(): boolean {
  if (document.querySelector("dialog[open]")) return true;
  const overlays = document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]');
  return Array.from(overlays).some((el) => !el.closest("[hidden]"));
}
