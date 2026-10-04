/**
 * Единая точка обратной связи интерфейса (#378): тосты, тост с действием и
 * уведомления колокольчика. Модули получают этот объект (или его методы)
 * через create и не зависят от main.ts.
 */
import type { NotificationWatch } from "./notifications";

export interface UiFeedback {
  /** Короткий тост на 3,5 с. */
  toast(message: string): void;
  /** Тост с кнопкой: клик — новый user gesture (скачивание в Firefox, #58). */
  toastAction(message: string, actionLabel: string, action: () => void, durationMs?: number): void;
  /** Уведомление в колокольчик (история с бейджем). */
  notify(message: string, watch?: NotificationWatch): void;
}

export interface UiFeedbackDeps {
  toastEl: HTMLElement;
  /** Системный текст: переводится при смене языка (setSystemText в main.ts). */
  setText: (el: HTMLElement, message: string) => void;
  createButton: () => HTMLButtonElement;
  createSpan: () => HTMLSpanElement;
  push: (message: string, watch?: NotificationWatch) => void;
  setTimer?: (fn: () => void, ms: number) => void;
}

export const TOAST_MS = 3500;
export const ACTION_TOAST_MS = 15_000;

export function createUiFeedback(deps: UiFeedbackDeps): UiFeedback {
  const setTimer = deps.setTimer ?? ((fn, ms) => void window.setTimeout(fn, ms));
  const el = deps.toastEl;
  // Токен показа: таймер скрытия гасит тост, только если поверх не показали
  // новый. Иначе короткий тост («Запись остановлена») уносил с собой кнопку
  // скачивания, которая должна жить 15с (issue #58).
  let token = 0;
  const hideLater = (ms: number): void => {
    const mine = ++token;
    setTimer(() => {
      if (token === mine) el.hidden = true;
    }, ms);
  };
  return {
    toast(message) {
      deps.setText(el, message);
      el.hidden = false;
      hideLater(TOAST_MS);
    },
    toastAction(message, actionLabel, action, durationMs = ACTION_TOAST_MS) {
      delete el.dataset.systemMessage;
      el.textContent = "";
      const span = deps.createSpan();
      deps.setText(span, message);
      const button = deps.createButton();
      button.className = "toast-action";
      deps.setText(button, actionLabel);
      button.addEventListener("click", () => {
        action();
        el.hidden = true;
      });
      el.append(span, button);
      el.hidden = false;
      hideLater(durationMs);
    },
    notify(message, watch) {
      deps.push(message, watch);
    },
  };
}
