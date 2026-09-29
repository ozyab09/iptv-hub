/**
 * Разделы приложения.
 *
 * До редизайна их не было: избранное включалось булевым фильтром, недавние
 * жили полоской над списком, а настройки были стартовым экраном. Дизайн-система
 * требует четырёх равноправных разделов с переключением — на телефоне таб-баром
 * снизу, на десктопе списком в сайдбаре.
 *
 * Здесь только данные и отбор каналов: без DOM, чтобы правила проверялись
 * тестами, а не глазами.
 */
import type { Channel } from "./types";

export type View = "channels" | "favorites" | "recents" | "settings";

export interface ViewMeta {
  id: View;
  /** Подпись в таб-баре и сайдбаре. */
  label: string;
  /** Имя иконки из src/icons.ts. */
  icon: string;
}

/** Порядок разделов — он же порядок вкладок. */
export const VIEWS: readonly ViewMeta[] = [
  { id: "channels", label: "Каналы", icon: "tv" },
  { id: "favorites", label: "Избранное", icon: "star" },
  { id: "recents", label: "Недавние", icon: "clock" },
  { id: "settings", label: "Настройки", icon: "settings" },
];

export const DEFAULT_VIEW: View = "channels";

/** Разбор сохранённого значения: чужое или испорченное — это раздел по умолчанию. */
export function parseView(raw: string | null): View {
  return VIEWS.some((v) => v.id === raw) ? (raw as View) : DEFAULT_VIEW;
}

/** Показывает ли раздел список каналов (у настроек своя разметка). */
export function showsChannelList(view: View): boolean {
  return view !== "settings";
}

/** Есть ли в разделе фильтр по категориям. */
export function showsCategories(view: View): boolean {
  return view === "channels";
}

/**
 * Каналы раздела до фильтров категории и поиска.
 *
 * «Недавние» идут в порядке просмотра, а не алфавита: список ведётся от
 * последнего открытого, и пересортировка сделала бы его бесполезным.
 */
export function channelsForView(
  view: View,
  channels: readonly Channel[],
  favorites: ReadonlySet<string>,
  recents: readonly string[],
): Channel[] {
  if (view === "settings") return [];
  if (view === "favorites") return channels.filter((c) => favorites.has(c.url));
  if (view === "recents") {
    const byUrl = new Map(channels.map((c) => [c.url, c]));
    return recents.flatMap((url) => {
      const c = byUrl.get(url);
      return c ? [c] : []; // канал мог исчезнуть из плейлиста
    });
  }
  return [...channels];
}

/** Текст пустого состояния — он разный по смыслу в каждом разделе. */
export function emptyMessage(view: View, hasQuery: boolean): string {
  if (hasQuery) return "Ничего не найдено";
  if (view === "favorites") return "Пока ничего не в избранном";
  if (view === "recents") return "Вы ещё ничего не смотрели";
  return "Ничего не найдено";
}

/**
 * «1 240 каналов»: число с неразрывным тонким пробелом между разрядами и
 * слово в нужном падеже (1 канал, 2 канала, 5 каналов, 11 каналов).
 */
export function channelsWord(n: number): string {
  const num = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "канал"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "канала"
        : "каналов";
  return `${num} ${word}`;
}

/** То же число без слова — для счётчиков рядом с заголовком. */
export function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
