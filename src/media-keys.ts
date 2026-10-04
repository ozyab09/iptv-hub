/**
 * Медиа-клавиши клавиатуры, гарнитуры и пульта (issue #392).
 *
 * Мультимедийные клавиатуры, Bluetooth-гарнитуры и ТВ-пульты шлют аппаратные
 * коды KeyboardEvent: MediaPlay/MediaPause/MediaPlayPause, MediaFastForward/
 * MediaRewind, MediaTrackNext/MediaTrackPrevious. Соответствие стандартное для
 * медиаплееров: Fast Forward — перемотка вперёд, Rewind — назад, Track Next/
 * Previous — следующий/предыдущий канал.
 *
 * Чистое сопоставление «код → действие» без DOM: UI-слой в main.ts сам решает,
 * применимо ли действие прямо сейчас (открыт ли плеер, идёт ли запись).
 */

export type MediaKeyAction =
  | "play" // ▶ — возобновить воспроизведение
  | "pause" // ⏸ — поставить на паузу
  | "toggle" // единая Play/Pause — переключить
  | "forward" // ▶▶ — перемотка вперёд (Fast Forward)
  | "backward" // ◀◀ — перемотка назад (Rewind)
  | "next" // ⏭ — следующий канал
  | "previous"; // ⏮ — предыдущий канал

const MEDIA_KEY_CODES: Readonly<Record<string, MediaKeyAction>> = {
  MediaPlay: "play",
  MediaPause: "pause",
  MediaPlayPause: "toggle",
  MediaFastForward: "forward",
  MediaRewind: "backward",
  MediaTrackNext: "next",
  MediaTrackPrevious: "previous",
};

/** Действие медиа-клавиши по её аппаратному коду; null — обычная клавиша. */
export function mediaKeyAction(code: string): MediaKeyAction | null {
  return MEDIA_KEY_CODES[code] ?? null;
}
