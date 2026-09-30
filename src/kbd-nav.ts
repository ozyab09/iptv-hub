/**
 * Клавиатурная навигация по списку каналов (FR-8).
 *
 * Чистая математика фокуса: список видимых каналов + текущий индекс,
 * без DOM. UI-слой маппит результат на карточки каналов.
 */

/** Следующий индекс по стрелкам; на краях останавливаемся (не зацикливаем —
 * список может быть длинным, скачок через «дно» сбивает с толку). */
export function moveFocus(count: number, current: number, delta: 1 | -1): number | null {
  if (count === 0) return null;
  const next = current + delta;
  if (next < 0 || next >= count) return null;
  return next;
}

/** Первый индекс: 0, если список не пуст. */
export function firstFocus(count: number): number | null {
  return count > 0 ? 0 : null;
}

/** Последний индекс: для End. */
export function lastFocus(count: number): number | null {
  return count > 0 ? count - 1 : null;
}

/**
 * Модалки: фокус-ловушка. Tab/Shift+Tab не выпускают из набора элементов.
 * Возвращает индекс следующего элемента внутри ловушки.
 */
export function trapFocus(count: number, current: number, shift: boolean): number {
  if (count === 0) return 0;
  if (shift) return (current - 1 + count) % count;
  return (current + 1) % count;
}
