import type { Channel } from "./types";

/**
 * Состояние заголовка плеера (канал, категория, тултип потока) — одна
 * точка правды (#253). Раньше заголовок писался в `playChannel`, а выбор
 * окна в мульти-вью его не трогал: в сетке заголовок «прилипал» к
 * первому каналу, с которого вошли. Чистая функция позволяет покрыть
 * логику тестами без DOM.
 */
export interface NowHeader {
  /** Текст в `#now-title`: имя канала, с суффиксом для архива. */
  title: string;
  /** Тултип `#now-title` — ссылка на поток (или URL архива). */
  href: string;
  /** Категория канала в `#now-category`. */
  category: string;
}

/** Заголовок для канала; `archiveUrl` — смотрим архив, не живой эфир. */
export function nowHeaderFor(channel: Channel | null, archiveUrl?: string): NowHeader {
  if (!channel) return { title: "", href: "", category: "" };
  return {
    title: archiveUrl ? `${channel.name} · архив` : channel.name,
    href: archiveUrl ?? channel.url,
    category: channel.group,
  };
}
