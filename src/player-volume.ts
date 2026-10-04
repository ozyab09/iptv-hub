/**
 * Громкость плеера и усиление до 200% для HLS (вынесено в #376).
 * До 100% — video.volume, выше — общий Web Audio граф (audio-graph.ts).
 * Недоступный захват возвращает 100% с предупреждением один раз на URL.
 */
import { createAudioGraph, volumePlan } from "./audio-graph";

export interface PlayerVolumeDeps {
  video: HTMLVideoElement;
  /** Поток идёт через hls.js — только его можно усилить. */
  hasHls: () => boolean;
  currentUrl: () => string | null;
  /** Усиление недоступно: предупредить пользователя. */
  warnBoost: () => void;
}

export class PlayerVolume {
  private graph: ReturnType<typeof createAudioGraph>;
  private requested = 1;
  private boost = false;
  private warnedUrl: string | null = null;

  constructor(private deps: PlayerVolumeDeps, volumePercent: number, boost: boolean) {
    this.graph = createAudioGraph(deps.video);
    this.requested = volumePercent / 100;
    this.boost = boost;
  }

  get canBoost(): boolean { return this.boost && this.deps.hasHls(); }

  setBoostEnabled(enabled: boolean, volume = this.requested): void {
    this.boost = enabled;
    this.requested = volumePlan(volume, enabled).volume;
    this.apply();
  }

  apply(): void {
    const video = this.deps.video;
    const plan = volumePlan(this.requested, this.canBoost);
    if (plan.gain > 1 && video.readyState < 2) {
      video.volume = 1;
      return;
    }
    if (!this.graph.volume(plan.volume, video.muted, this.canBoost) && plan.gain > 1) {
      this.requested = 1;
      this.graph.volume(1, video.muted, false);
      const url = this.deps.currentUrl();
      if (this.warnedUrl !== url) {
        this.warnedUrl = url;
        this.deps.warnBoost();
      }
    }
  }

  /** Громкость 0..2 при усилении HLS (мьют отдельно). */
  set(v: number): void {
    this.requested = volumePlan(v, this.canBoost).volume;
    if (this.deps.video.muted && this.requested > 0) this.deps.video.muted = false;
    this.apply();
  }

  get(): number {
    return this.deps.video.muted ? 0 : volumePlan(this.requested, this.canBoost).volume;
  }

  toggleMute(): void {
    this.deps.video.muted = !this.deps.video.muted;
    this.apply();
  }

  capture(): { track: MediaStreamTrack; release: () => void } | null { return this.graph.capture(); }

  /** Смена источника: граф отключается, элемент получает громкость до 100%. */
  teardown(): void {
    this.graph.teardown();
    this.deps.video.volume = Math.min(1, this.requested);
  }
}
