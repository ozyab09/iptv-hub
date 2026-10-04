/** Локальный MPEG-TS отдаём hls.js как один сегмент конечного HLS-потока. */
export function recordingManifest(url: string, durationSec: number): string {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
  return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${Math.ceil(duration)}\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:${duration},\n${url}\n#EXT-X-ENDLIST\n`;
}

/** Источники записи для плеера: blob файла и (для TS через hls.js) blob манифеста. */
export interface RecordingSources {
  /** Все blob-URL, которыми владеет плеер до остановки/смены записи. */
  urls: string[];
  /** Что отдать плееру. */
  source: string;
  /** Играть через hls.js (MSE), иначе нативно. */
  hls: boolean;
}

/**
 * MPEG-TS → hls.js через MSE (или нативно, если браузер умеет video/mp2t),
 * mp4/webm — нативно. null — TS без MSE и без нативной поддержки.
 */
export function recordingSources(file: Blob, ext: string, durationSec: number, canHls: boolean, canPlayTs: () => boolean): RecordingSources | null {
  const ts = ext === "ts";
  const hls = ts && canHls;
  if (ts && !hls && !canPlayTs()) return null;
  const mime = ts ? "video/mp2t" : ext === "mp4" ? "video/mp4" : "video/webm";
  const fileUrl = URL.createObjectURL(new Blob([file], { type: mime }));
  if (!hls) return { urls: [fileUrl], source: fileUrl, hls };
  const manifest = URL.createObjectURL(new Blob([recordingManifest(fileUrl, durationSec)], { type: "application/vnd.apple.mpegurl" }));
  return { urls: [fileUrl, manifest], source: manifest, hls };
}
