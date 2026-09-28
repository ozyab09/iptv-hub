/** Канал, извлечённый из M3U-плейлиста. */
export interface Channel {
  /** Отображаемое имя (из атрибутов #EXTINF). */
  name: string;
  /** Имя в нижнем регистре без эмодзи/quality-маркеров — для поиска и матчинга EPG. */
  normalizedName: string;
  /** URL потока (http/https/rtmp…). */
  url: string;
  /** tvg-id из #EXTINF, если был. */
  tvgId: string | null;
  /** tvg-logo из #EXTINF, если был. */
  logo: string | null;
  /** group-title (категория). */
  group: string;
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
