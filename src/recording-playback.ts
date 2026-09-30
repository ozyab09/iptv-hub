/** Локальный MPEG-TS отдаём hls.js как один сегмент конечного HLS-потока. */
export function recordingManifest(url: string, durationSec: number): string {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
  return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${Math.ceil(duration)}\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:${duration},\n${url}\n#EXT-X-ENDLIST\n`;
}
