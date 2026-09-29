/**
 * Чистая математика виртуализации списка: какие строки показывать
 * в видимом окне + оффсет. Без DOM — покрывается тестами.
 *
 * Схема: контейнер фиксированной высоты прокручивается; внутри — спейсер
 * высотой rows*pitch; карточки позиционируются через translateY спейсера.
 * Контейнер — CSS-grid с N колонками (см. .virtual-inner), поэтому высоту
 * считаем в строках: rows = ceil(items / columns). Высота строки
 * детерминирована CSS (min-height 56px, см. .channel-card).
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

/** Число колонок сетки по ширине контейнера и min-ширине карточки. Чистая функция. */
export function columnsForWidth(
  containerWidth: number,
  minCardWidth: number = 240,
): number {
  if (containerWidth <= 0 || minCardWidth <= 0) return 1;
  // Формула автозаполнения grid: repeat(auto-fill, minmax(min, 1fr)).
  return Math.max(1, Math.floor(containerWidth / minCardWidth));
}

/** Число строк сетки: items раскладываются по columns. Чистая функция. */
export function rowsForCount(itemCount: number, columns: number): number {
  const cols = Math.max(1, Math.floor(columns));
  if (itemCount <= 0) return 0;
  return Math.ceil(itemCount / cols);
}

/** Окно видимости для scrollTop/viewportH. Чистая функция. */
export function computeWindow(
  scrollTop: number,
  viewportH: number,
  itemCount: number,
  rowH: number = DEFAULT_ROW_HEIGHT,
  overscan: number = DEFAULT_OVERSCAN,
  columns: number = 1,
): VirtualWindow {
  if (itemCount <= 0 || viewportH <= 0 || rowH <= 0) {
    return { start: 0, count: 0, offset: 0 };
  }
  const rows = rowsForCount(itemCount, columns);
  const firstVisible = Math.floor(scrollTop / rowH);
  const visible = Math.ceil(viewportH / rowH);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(rows, firstVisible + visible + overscan);
  return { start, count: end - start, offset: start * rowH };
}

/** Общая высота спейсера: строки сетки * высота строки. */
export function spacerHeight(
  itemCount: number,
  rowH: number = DEFAULT_ROW_HEIGHT,
  columns: number = 1,
): number {
  return rowsForCount(itemCount, columns) * rowH;
}

/** Индекс строки по Y-позиции (для прокрутки к каналу). */
export function indexForOffset(y: number, rowH: number = DEFAULT_ROW_HEIGHT): number {
  if (rowH <= 0) return 0;
  return Math.max(0, Math.floor(y / rowH));
}
