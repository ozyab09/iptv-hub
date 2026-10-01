/** Канал, извлечённый из M3U-плейлиста. */
export interface Channel {
  /** Отображаемое имя (из атрибутов #EXTINF). */
  name: string;
  /** Имя в нижнем регистре без эмодзи/quality-маркеров — для поиска и матчинга EPG. */
  normalizedName: string;
  /** URL потока (http/https/rtmp…). */
  url: string;
  /** Дополнительные URL того же канала, в порядке автоматического переключения. */
  mirrors?: string[];
  /** tvg-id из #EXTINF, если был. */
  tvgId: string | null;
  /** tvg-logo из #EXTINF, если был. */
  logo: string | null;
  /** group-title (категория). */
  group: string;
  /** Глубина catchup-архива в днях (tvg-rec/catchup-days), 0 — нет архива. */
  catchupDays: number;
  /** Шаблон URL архива (catchup-source), если задан провайдером. */
  catchupSource: string | null;
  /** Качество из имени: 4K/UHD > FHD > HD > SD > null. */
  quality: "4K" | "FHD" | "HD" | "SD" | null;
}

/** Снимок разобранного плейлиста. */
export interface PlaylistSnapshot {
  /** Каналы в исходном порядке (уже отсортированы по алфавиту). */
  channels: Channel[];
  /** Уникальные категории в алфавитном порядке. */
  categories: string[];
  /** Заголовок #EXTM3U (там бывает tvg-url — fallback для EPG). */
  headerTvgUrl: string | null;
  /**
   * Скрытые http-каналы (публичные хосты): на https-странице браузер
   * блокирует mixed content, играть они не могут. Счётчик нужен для тоста,
   * чтобы пропажа каналов не выглядела потерей части плейлиста.
   */
  droppedHttp: number;
}

/** Передача из телепрограммы (XMLTV). */
export interface EpgProgramme {
  /** ISO 8601 UTC. */
  start: string;
  /** ISO 8601 UTC. */
  stop: string;
  title: string;
  /** Описание может отсутствовать. */
  desc: string | null;
}

/** Пара «идёт сейчас / следующий» для канала. */
export interface NowNext {
  now: EpgProgramme | null;
  next: EpgProgramme | null;
}
