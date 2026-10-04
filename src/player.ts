import type Hls from "hls.js";
import { PlayerCore } from "./player-core";
import { togglePictureInPicture } from "./player-media";
import type { SubtitleCue } from "./external-subtitles";
import { enableTimeshift, goLive, isLiveHls, liveEdgeOf, seekBy } from "./player-timeshift";

// Публичный API модуля прежний: правила и навигация живут в соседних модулях (#376).
export * from "./player-recovery";
export { neighborIndex, seekBy, skipTarget } from "./player-timeshift";
export { getNetworkConnection, type NetworkConnection } from "./player-media";

/**
 * Плеер поверх <video>: hls.js для .m3u8, нативные механизмы для остальных.
 * Источники и жизненный цикл — PlayerCore; здесь управление воспроизведением,
 * громкостью, дорожками и состояние для UI.
 */
export class Player extends PlayerCore {
  seekBy(deltaSec: number): void {
    const live = isLiveHls(this.hls);
    if (live) enableTimeshift(this.hls, this.activeSettings.maxBufferLength);
    seekBy(this.video, deltaSec, live);
  }

  get liveEdge(): number { return liveEdgeOf(this.hls, this.video); }

  goLive(): void { goLive(this.hls, this.video, this.activeSettings.maxBufferLength); }

  setBoostEnabled(enabled: boolean, volume?: number): void { this.volume.setBoostEnabled(enabled, volume); }
  get canBoostVolume(): boolean { return this.volume.canBoost; }
  captureAudioTrack(): { track: MediaStreamTrack; release: () => void } | null { return this.volume.capture(); }
  /** Громкость 0..2 при усилении HLS (мьют отдельно). */
  setVolume(v: number): void { this.volume.set(v); }
  getVolume(): number { return this.volume.get(); }
  toggleMute(): void { this.volume.toggleMute(); }

  /** Picture-in-Picture. False — API недоступен или отказано. */
  async togglePip(): Promise<boolean> {
    const result = await togglePictureInPicture(this.video);
    if (result !== "ok") this.toast(this.tr(result === "unsupported" ? "player.pipUnsupported" : "player.pipFailed"));
    return result === "ok";
  }

  // ---- Качество / дорожки (работают только когда поток через hls.js) ----

  /** Живой hls-инстанс или null (нативный playback — управление недоступно). */
  getHls(): Hls | null { return this.hls; }

  /** Выбрать уровень качества; -1 = Auto. */
  setLevel(index: number): void {
    if (!this.hls) return;
    this.manualQuality = index >= 0;
    this.refreshMobileQuality();
    this.hls.currentLevel = index;
  }

  setAudioTrack(index: number): void { if (this.hls) this.hls.audioTrack = index; }

  /** Выбрать субтитры; -1 = выключены. */
  setSubtitleTrack(index: number): void {
    this.setExternalSubtitleEnabled(false);
    if (this.hls) this.hls.subtitleTrack = index;
  }

  loadExternalSubtitles(cues: readonly SubtitleCue[], name: string, enabled = true): void {
    this.subtitles.load(cues, name);
    this.setExternalSubtitleEnabled(enabled);
  }

  setExternalSubtitleEnabled(enabled: boolean): void {
    this.subtitles.setEnabled(enabled);
    if (enabled && this.hls) this.hls.subtitleTrack = -1;
  }

  get externalSubtitle(): { name: string; enabled: boolean } | null { return this.subtitles.info; }

  /** Текущий URL потока (после https-апгрейда) — для диагностики фатальных ошибок. */
  get currentStreamUrl(): string | null { return this.currentUrl; }

  /** Основной URL остаётся идентификатором канала при переключении зеркала. */
  get currentChannelUrl(): string | null { return this.channelUrl; }

  get isRecordingPlayback(): boolean { return this.recordingUrls.length > 0; }

  get recordingDurationSec(): number { return this.isRecordingPlayback ? this.recordingDuration : 0; }

  /** Таймаут снимка настроек текущего канала, независимо от редактирования UI. */
  get diagnosticsTimeoutMs(): number { return this.activeSettings.diagnosticsTimeoutMs; }

}
