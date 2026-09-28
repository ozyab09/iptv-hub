import Hls from "hls.js";
import type { Channel } from "./types";

/**
 * Плеер поверх <video>: hls.js для .m3u8, нативные механизмы для остальных.
 * Управление воспроизведением/громкостью/PiP — через нативный media API
 * (юнит-тесты покрывают чистую логику: neighborIndex, see tests/player-logic).
 */
export class Player {
  private video: HTMLVideoElement;
  private hls: Hls | null = null;
  private currentUrl: string | null = null;
  private toast: (msg: string) => void;
  /** Вызывается, когда hls сообщит о манифесте/уровне/дорожках (для UI). */
  private onHlsState: (() => void) | null;

  constructor(
    video: HTMLVideoElement,
    toast: (msg: string) => void,
    onHlsState?: () => void,
  ) {
    this.video = video;
    this.toast = toast;
    this.onHlsState = onHlsState ?? null;
  }

  /** Играть канал. True — попытка начата, false — URL не поддерживается. */
  play(channel: Channel): boolean {
    const url = channel.url;
    if (this.currentUrl === url && !this.video.paused) return true;
    this.stop();

    const isHls = /\.m3u8(\?|$)/i.test(url) || /[?&]type=m3u8/i.test(url);
    const isDash = /\.mpd(\?|$)/i.test(url);

    if (isHls && Hls.isSupported()) {
      this.hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);
      this.hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          this.toast(`Ошибка потока: ${data.details ?? "unknown"}`);
        }
      });
      const notify = (): void => this.onHlsState?.();
      this.hls.on(Hls.Events.MANIFEST_PARSED, notify);
      this.hls.on(Hls.Events.LEVEL_SWITCHED, notify);
      this.hls.on(Hls.Events.LEVEL_UPDATED, notify);
      this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, notify);
      this.hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, notify);
    } else if (isDash) {
      this.toast("MPEG-DASH не поддерживается в MVP (см. ROADMAP)");
      return false;
    } else {
      // http progressive (mp4) или нативный HLS в Safari/iOS
      this.video.src = url;
    }

    this.currentUrl = url;
    this.video.play().catch(() => {
      // автоплей с звуком может быть заблокирован — юзер нажмёт play вручную
    });
    return true;
  }

  /** Пауза/продолжить. Возвращает true после вызова — на паузе или играет. */
  togglePause(): void {
    if (this.video.paused) {
      this.video.play().catch(() => {
        // автоплей заблокирован — юзер повторит клик
      });
    } else {
      this.video.pause();
    }
  }

  /** Громкость 0..1 (мьют отдельно). */
  setVolume(v: number): void {
    this.video.volume = Math.min(1, Math.max(0, v));
    if (this.video.muted && this.video.volume > 0) this.video.muted = false;
  }

  getVolume(): number {
    return this.video.muted ? 0 : this.video.volume;
  }

  toggleMute(): void {
    this.video.muted = !this.video.muted;
  }

  /** Picture-in-Picture. False — API недоступен или отказано. */
  async togglePip(): Promise<boolean> {
    if (!document.pictureInPictureEnabled) {
      this.toast("PiP не поддерживается этим браузером");
      return false;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await this.video.requestPictureInPicture();
      }
      return true;
    } catch {
      this.toast("Не удалось открыть плавающее окно");
      return false;
    }
  }

  stop(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.video.removeAttribute("src");
    this.video.load();
    this.currentUrl = null;
  }

  // ---- Качество / дорожки (работают только когда поток через hls.js) ----

  /** Живой hls-инстанс или null (нативный playback — управление недоступно). */
  getHls(): Hls | null {
    return this.hls;
  }

  /** Выбрать уровень качества; -1 = Auto. */
  setLevel(index: number): void {
    if (this.hls) this.hls.currentLevel = index;
  }

  /** Выбрать аудиодорожку. */
  setAudioTrack(index: number): void {
    if (this.hls) this.hls.audioTrack = index;
  }

  /** Выбрать субтитры; -1 = выключены. */
  setSubtitleTrack(index: number): void {
    if (this.hls) this.hls.subtitleTrack = index;
  }
}

/**
 * Соседний индекс по списку каналов с зацикливанием.
 * Чистая функция — покрывается юнит-тестами.
 * Возвращает null, если список пуст.
 */
export function neighborIndex(
  current: number,
  length: number,
  step: 1 | -1,
): number | null {
  if (length <= 0) return null;
  return (((current + step) % length) + length) % length;
}

/**
 * Цель перемотки ±сек. Чистая функция с валидацией границ.
 * live-поток не перематывается — возвращает null;
 * выход за [0, duration] обрезается к границе.
 */
export function skipTarget(
  current: number,
  deltaSec: number,
  duration: number,
  isLive: boolean,
): number | null {
  if (isLive) return null;
  if (!Number.isFinite(current)) return null;
  const target = current + deltaSec;
  const max = Number.isFinite(duration) && duration > 0 ? duration : current;
  return Math.min(Math.max(target, 0), max);
}

/** Перемотать видео на ±сек (учитывает live-режим). */
export function seekBy(video: HTMLVideoElement, deltaSec: number): void {
  const live = !Number.isFinite(video.duration) || video.duration === 0;
  const target = skipTarget(video.currentTime, deltaSec, video.duration, live);
  if (target !== null) video.currentTime = target;
}
