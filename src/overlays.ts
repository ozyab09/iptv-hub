/**
 * Стек оверлеев для кнопки «назад» (FR-6).
 *
 * Чистая логика без DOM: операции над строковым стеком открытых оверлеев.
 * UI-слой (main.ts) маппит имена на DOM-узлы, а сюда передаёт/получает
 * только имена — это позволяет покрыть логику тестами в node.
 */

export type OverlayName =
  | "player"
  | "guide"
  | "manager"
  | "quality"
  | "notifications";

/**
 * Открыть оверлей. Если он уже на вершине стека — стек не меняется
 * (повторное открытие не раздувает history). Если он есть глубже —
 * считается повторным открытием: поднимаем на вершину без дубля.
 */
export function pushOverlay(stack: string[], name: OverlayName): string[] {
  if (stack[stack.length - 1] === name) return stack;
  return [...stack.filter((n) => n !== name), name];
}

/** Закрыть оверлей: снимает его и всё, что выше (они его перекрывали). */
export function popOverlay(stack: string[], name: OverlayName): string[] {
  const idx = stack.lastIndexOf(name);
  if (idx < 0) return stack;
  return stack.slice(0, idx);
}

/** Верхний оверлей или null, если стек пуст. */
export function topOverlay(stack: string[]): OverlayName | null {
  return (stack[stack.length - 1] as OverlayName | undefined) ?? null;
}

/**
 * Свернуть стек при полном закрытии UI (например, закрыли гайд вместе
 * с плеером): убирает name и всё выше; возвращает новый стек.
 */
export function closeDownTo(stack: string[], name: OverlayName): string[] {
  return popOverlay(stack, name);
}
