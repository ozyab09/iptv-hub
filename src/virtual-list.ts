/**
 * Чистая математика виртуализации списка: какие строки показывать
 * в видимом окне + оффсет. Без DOM — покрывается тестами.
 *
 * Схема: контейнер фиксированной высоты прокручивается; внутри — спейсер
 * высотой items*rowH; карточки позиционируются абсолютом по index.
 */

export interface VirtualWindow {
  /** Индекс первой видимой строки (с запасом overscan). */
  start: number;
  /** Сколько строк рендерить (с запасом). */
  count: number;
  /** translateY контейнера карточек внутри спейсера, px. */
  offset: number;
}

export const DEFAULT_ROW_HEIGHT = 56;
export const DEFAULT_OVERSCAN = 6;

/** Окно видимости для scrollTop/viewportH. Чистая функция. */
export function computeWindow(
  scrollTop: number,
  viewportH: number,
  itemCount: number,
  rowH: number = DEFAULT_ROW_HEIGHT,
  overscan: number = DEFAULT_OVERSCAN,
): VirtualWindow {
  if (itemCount <= 0 || viewportH <= 0 || rowH <= 0) {
    return { start: 0, count: 0, offset: 0 };
  }
  const firstVisible = Math.floor(scrollTop / rowH);
  const visible = Math.ceil(viewportH / rowH);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(itemCount, firstVisible + visible + overscan);
  return { start, count: end - start, offset: start * rowH };
}

/** Общая высота спейсера для itemCount строк. */
export function spacerHeight(itemCount: number, rowH: number = DEFAULT_ROW_HEIGHT): number {
  return itemCount > 0 ? itemCount * rowH : 0;
}

/** Индекс строки по Y-позиции (для прокрутки к каналу). */
export function indexForOffset(y: number, rowH: number = DEFAULT_ROW_HEIGHT): number {
  if (rowH <= 0) return 0;
  return Math.max(0, Math.floor(y / rowH));
}
