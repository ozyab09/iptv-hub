/**
 * Чистые хелперы для качества/дорожек/статус-бара.
 * Никакого DOM и hls.js — тестируются в node.
 */

/** Уровень качества из манифеста HLS. */
export interface QualityLevel {
  /** Высота в пикселях (1080 для FHD). */
  height: number;
  /** Битрейт, бит/с. */
  bitrate: number;
  /** Индекс в hls.levels (для выбора). */
  index?: number;
}

/** Формат скорости потока: 0 → «—», <1 Мбит/с → кбит/с, иначе Мбит/с. */
export function formatBitrate(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "—";
  if (bps < 1_000_000) return `${Math.round(bps / 1000)} кбит/с`;
  return `${(bps / 1_000_000).toFixed(1)} Мбит/с`;
}

/** «1920×1080» или «—», если размеры неизвестны. */
export function formatResolution(
  width: number | undefined,
  height: number | undefined,
): string {
  if (!width || !height) return "—";
  return `${width}×${height}`;
}

/**
 * Короткое имя качества по высоте потока — для лейбла кнопки:
 * ≥2000 → 4K, ≥1400 → QHD, ≥1000 → FHD, ≥700 → HD, ≥400 → SD, иначе — «{h}p».
 */
export function tierName(height: number): string {
  if (!Number.isFinite(height) || height <= 0) return "—";
  if (height >= 2000) return "4K";
  if (height >= 1400) return "QHD";
  if (height >= 1000) return "FHD";
  if (height >= 700) return "HD";
  if (height >= 400) return "SD";
  return `${height}p`;
}

/** Лейбл кнопки качества: «Auto · HD» или «1080p». */
export function qualityButtonLabel(
  auto: boolean,
  level: QualityLevel | null,
): string {
  if (auto) {
    const t = level && level.height ? tierName(level.height) : "";
    return t ? `Auto · ${t}` : "Auto";
  }
  return level && level.height ? tierName(level.height) : "—";
}

/**
 * Подпись уровня качества для меню выбора: «1080p (4.5 Мбит/с)».
 */
export function levelLabel(level: QualityLevel): string {
  const h = level.height ? `${level.height}p` : "уровень";
  return level.bitrate ? `${h} (${formatBitrate(level.bitrate)})` : h;
}

/**
 * Сортировка уровней по убыванию высоты (для меню — лучшие сверху).
 * Без мутирования входного массива.
 */
export function sortLevelsDesc(levels: QualityLevel[]): QualityLevel[] {
  return [...levels].sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
}

/** Подпись дорожки (аудио/субтитры): имя или «Дорожка N». */
export function trackLabel(
  track: { name?: string; lang?: string },
  index: number,
): string {
  const base = track.name?.trim() || track.lang?.trim() || `Дорожка ${index + 1}`;
  return track.lang && track.name?.trim() && track.lang !== track.name.trim()
    ? `${base} [${track.lang}]`
    : base;
}

/** Состояние статус-бара. */
export interface PlayerStatus {
  resolution: string;
  bitrate: string;
}

/** Собрать текст статус-бара: «1920×1080 · 4.5 Мбит/с». */
export function formatStatus(status: PlayerStatus): string {
  return `${status.resolution} · ${status.bitrate}`;
}
