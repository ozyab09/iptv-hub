import Hls from "hls.js";
import type { Channel } from "./types";

/** Плеер поверх <video>: hls.js для .m3u8, нативные механизмы для остальных. */
export class Player {
  private video: HTMLVideoElement;
  private hls: Hls | null = null;
  private currentUrl: string | null = null;
  private toast: (msg: string) => void;

  constructor(
    video: HTMLVideoElement,
    toast: (msg: string) => void,
  ) {
    this.video = video;
    this.toast = toast;
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

  stop(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.video.removeAttribute("src");
    this.video.load();
    this.currentUrl = null;
  }
}
