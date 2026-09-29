/**
 * Выбор классов дизайн-системы по состоянию.
 *
 * Вынесено из main.ts, потому что решение «какой класс при каком состоянии» —
 * это правило системы, а не разметка: акцентом красится только то, что играет,
 * выбранный чип инвертируется, а не розовеет, 4K — единственное качество
 * с цветом. Здесь это можно проверить тестами без DOM.
 */

/** Строка канала в списке. */
export function channelRowClass(isPlaying: boolean): string {
  return isPlaying ? "row channel-card on" : "row channel-card";
}

/** Чип категории: выбранный инвертируется (текст фоном), а не красится акцентом. */
export function chipClass(isActive: boolean): string {
  return isActive ? "chip on" : "chip";
}

/** Звезда избранного: акцент только у включённой. */
export function starClass(isFavorite: boolean): string {
  return isFavorite ? "star on" : "star";
}

/**
 * Бейдж качества. Цвет есть только у 4K — дизайн-система отдаёт ему
 * warning, остальные остаются нейтральными, чтобы список не пестрел.
 */
export function qualityBadgeClass(quality: string): string {
  return quality.toLowerCase() === "4k" ? "badge q4k" : "badge";
}

/** Строка программы: прошедшая, идущая сейчас или будущая. */
export function programRowClass(state: "past" | "now" | "next"): string {
  if (state === "now") return "prog-row now";
  if (state === "past") return "prog-row past";
  return "prog-row";
}

/** Пункт меню (качество, дорожки, субтитры). */
export function menuItemClass(isSelected: boolean): string {
  return isSelected ? "menu-item on" : "menu-item";
}
