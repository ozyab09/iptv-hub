import { describe, expect, it, vi } from "vitest";
import { ACTION_TOAST_MS, createUiFeedback, TOAST_MS } from "../src/ui-feedback";

class El {
  hidden = true;
  textContent = "";
  className = "";
  dataset: Record<string, string> = {};
  children: El[] = [];
  listeners: Record<string, () => void> = {};
  append(...nodes: El[]) { this.children.push(...nodes); }
  addEventListener(type: string, fn: () => void) { this.listeners[type] = fn; }
}

function harness() {
  const timers: { fn: () => void; ms: number }[] = [];
  const toastEl = new El();
  const pushed: unknown[][] = [];
  const feedback = createUiFeedback({
    toastEl: toastEl as unknown as HTMLElement,
    setText: (el, message) => { (el as unknown as El).textContent = message; (el as unknown as El).dataset.systemMessage = message; },
    createButton: () => new El() as unknown as HTMLButtonElement,
    createSpan: () => new El() as unknown as HTMLSpanElement,
    push: (...args) => pushed.push(args),
    setTimer: (fn, ms) => timers.push({ fn, ms }),
  });
  return { feedback, toastEl, timers, pushed };
}

// #378: тосты и уведомления — одна инъекционная точка для main и модулей.
describe("createUiFeedback", () => {
  it("тост показывается и скрывается через 3,5 с", () => {
    const h = harness();
    h.feedback.toast("Сохранено");
    expect(h.toastEl.hidden).toBe(false);
    expect(h.toastEl.textContent).toBe("Сохранено");
    expect(h.timers[0]!.ms).toBe(TOAST_MS);
    h.timers[0]!.fn();
    expect(h.toastEl.hidden).toBe(true);
  });

  it("новый тост не гасится таймером прошлого (#58)", () => {
    const h = harness();
    h.feedback.toastAction("Скачивание", "Скачать", () => undefined);
    h.feedback.toast("Запись остановлена");
    h.timers[0]!.fn(); // таймер тоста с действием
    expect(h.toastEl.hidden).toBe(false);
    h.timers[1]!.fn();
    expect(h.toastEl.hidden).toBe(true);
  });

  it("тост с действием: кнопка живёт 15 с, клик выполняет действие и скрывает тост", () => {
    const h = harness();
    const action = vi.fn();
    h.feedback.toastAction("Автоскачивание не началось?", "Скачать file.ts", action);
    expect(h.timers[0]!.ms).toBe(ACTION_TOAST_MS);
    expect(h.toastEl.dataset.systemMessage).toBeUndefined();
    const button = h.toastEl.children[1]!;
    expect(button.className).toBe("toast-action");
    expect(button.textContent).toBe("Скачать file.ts");
    button.listeners.click!();
    expect(action).toHaveBeenCalledOnce();
    expect(h.toastEl.hidden).toBe(true);
  });

  it("уведомление уходит в колокольчик вместе с целью «Смотреть»", () => {
    const h = harness();
    h.feedback.notify("Скоро: Матч", { playlistId: "a", channelUrl: "u" });
    expect(h.pushed).toEqual([["Скоро: Матч", { playlistId: "a", channelUrl: "u" }]]);
  });
});
