/**
 * Гард горячих клавиш (срез 1: S — скриншот, ←/→ — перемотка ±15 с).
 *
 * Код разделён в одном месте, чтобы не ловить клавиши в поле ввода,
 * в модальном диалоге/меню, на настройках/записи, на мини-плеере и
 * когда панель скрыта.
 */

/** Можно ли сейчас обрабатывать горячие клавиши в интерфейсе. */
export function canHotkey(): boolean {
  return hasFocusableChannelView() && !isOverlayOpen();
}

/**
 * Наличие активного просмотра списка каналов без фокуса ввода и без открытых
 * диалогов/меню.
 */
function hasFocusableChannelView(): boolean {
  const focused = document.activeElement as HTMLElement | null;
  const dialogOpen = isOverlayOpen();

  return (
    !playerBar.hidden &&
    showsChannelList(activeView) &&
    (!isCompact() || playerBar.classList.contains("open")) &&
    !focused?.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable=false])",
    ) &&
    !dialogOpen
  );
}

/** Открыт ли верхний оверлей/модальный интерфейс. */
function isOverlayOpen(): boolean {
  return (
    !!document.querySelector('dialog[open]') ||
    !!document.querySelector('[role="dialog"]') ||
    !!document.querySelector('[role="menu"]') ||
    !!document.querySelector('[role="listbox"]')
  );
}

/** Плеер: скрыта ли панель с кнопками. */
declare const playerBar: HTMLElement;

/** Активный раздел (например, \"channels\"). */
declare const activeView: string;

/** Ширина компактного экрана (1023px — закомпрометированное пороговое значение). */
declare const isCompact: () => boolean;

declare const showsChannelList: (view: string) => boolean;
