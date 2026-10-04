/** Ядро плеера (#376): источники, https-апгрейд, зеркала, записи, жизненный цикл; управление — Player. */
import Hls from "hls.js";
import { isMixedContent } from "./config";
import { appProxyUrl } from "./app-proxy";
import type { Channel } from "./types";
import { DEFAULT_PLAYER_SETTINGS, sanitizePlayerSettings, type PlayerSettings } from "./player-settings";
import { recordingSources } from "./recording-playback";
import { t, type Language, type TranslationKey, type TranslationParams } from "./i18n";
import { createMirrorState, nextMirror, type MirrorState } from "./channel-mirrors";
import { autoLevelCap, getNetworkConnection, type NetworkConnection } from "./player-media";
import { httpToHttps } from "./player-recovery";
import { handleHlsFatal, handleNativeFatal, type FatalContext, type HlsRecoveryState } from "./player-diagnostics";
import { createHlsSession } from "./player-hls";
import { enableTimeshift } from "./player-timeshift";
import { PlayerVolume } from "./player-volume";
import { ExternalSubtitles } from "./player-subtitles";

export class PlayerCore {
  protected hls: Hls | null = null;
  protected currentUrl: string | null = null;
  protected mirrorState: MirrorState | null = null;
  protected channelUrl: string | null = null;
  protected forceHls = false;
  protected onFragment: ((payload: ArrayBuffer, isInit: boolean) => void) | null = null;
  protected onStreamChange: (() => void) | null = null;
  protected recovery: HlsRecoveryState = { networkRetries: 0, media: null };
  /** https-апгрейд для текущего URL уже пробовали — второй раз не ждём. */
  protected httpsFallbackTried = false;
  /** Текущий URL — результат https-апгрейда (для сообщений об ошибке). */
  protected httpsUpgraded = false;
  protected activeSettings: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS };
  protected connection: NetworkConnection | null = null;
  protected manualQuality = false;
  /** Файл и локальный манифест живут до закрытия/смены записи, включая перемотку. */
  protected recordingUrls: string[] = [];
  protected recordingDuration = 0;
  protected volume: PlayerVolume;
  protected subtitles: ExternalSubtitles;
  protected refreshMobileQuality = (): void => {
    if (this.hls) this.hls.autoLevelCapping = autoLevelCap(this.hls, this.activeSettings, this.connection, this.manualQuality, this.currentUrl);
  };
  protected tr = (key: TranslationKey, params: TranslationParams = {}): string => t(key, this.language(), params);
  /** Общие действия для разбора фатальных ошибок hls.js и нативного видео. */
  protected fatalContext: FatalContext = {
    tr: this.tr,
    toast: (message) => this.toast(message),
    fatal: () => this.onFatalError?.(),
    isRecording: () => this.recordingUrls.length > 0,
    tryNextMirror: () => this.tryNextMirror(),
  };

  constructor(
    protected video: HTMLVideoElement,
    protected toast: (msg: string) => void,
    /** Манифест/уровень/дорожки изменились (для UI). */
    protected onHlsState?: () => void,
    /** Фатальная ошибка потока (retry-кнопка UI). */
    protected onFatalError?: () => void,
    protected readSettings: () => PlayerSettings = () => ({ ...DEFAULT_PLAYER_SETTINGS }),
    protected onMirrorChange?: () => void,
    protected language: () => Language = () => "ru",
  ) {
    const settings = sanitizePlayerSettings(readSettings());
    this.volume = new PlayerVolume({
      video,
      hasHls: () => this.hls !== null,
      currentUrl: () => this.currentUrl,
      warnBoost: () => this.toast(this.tr("error.volumeBoost")),
    }, settings.volumePercent, settings.volumeBoost);
    this.subtitles = new ExternalSubtitles(video);
    // Нативный playback (mp4/Safari): ошибки <video> — единственный канал
    // фатальных ошибок; через них же спасаем mixed content апгрейдом.
    video.addEventListener("error", this.handleVideoError);
    video.addEventListener("pause", () => enableTimeshift(this.hls, this.activeSettings.maxBufferLength));
    video.addEventListener("loadeddata", () => this.volume.apply());
  }

  /**
   * Подписаться на загружаемые сегменты (основа записи эфира). Подписка
   * переживает смену канала; `payload` живёт только внутри вызова — hls.js
   * отдаёт буфер в воркер трансфером, сохранять нужно копию.
   */
  setFragmentListener(cb: (payload: ArrayBuffer, isInit: boolean) => void, onStreamChange?: () => void): void {
    this.onFragment = cb;
    this.onStreamChange = onStreamChange ?? null;
  }

  /** Mixed content (https-страница, http-канал): пробуем https-порт того же хоста (#67). */
  protected resolvePlayableUrl(url: string): string {
    this.httpsUpgraded = false;
    // Android-приложение: http публичного хоста — через его прокси (#452), без https-апгрейда.
    const proxied = appProxyUrl(url, window.location.href);
    if (proxied) return proxied;
    if (!isMixedContent(window.location.href, url)) return url;
    const upgraded = httpToHttps(url);
    if (!upgraded) return url;
    console.debug(`[iptv-hub] mixed content: пробую ${upgraded}`);
    this.httpsUpgraded = true;
    this.toast(this.tr("player.upgrade"));
    return upgraded;
  }

  protected handleVideoError = (): void => {
    if (this.hls || !this.currentUrl) return;
    const err = this.video.error;
    console.debug(`[iptv-hub] native video error: code=${err?.code} ${err?.message ?? ""}`);
    handleNativeFatal(this.currentUrl, {
      ...this.fatalContext,
      httpsTried: () => this.httpsFallbackTried,
      upgrade: (url) => {
        this.httpsFallbackTried = true;
        this.httpsUpgraded = true;
        this.currentUrl = url;
        this.video.src = url;
        this.video.play().catch(() => undefined);
      },
    }, window.location.href);
  };

  /** Играть канал: null — начато, строка — причина отказа; тот же канал на паузе продолжается (#280). */
  play(channel: Pick<Channel, "url" | "mirrors">, forceHls = false): string | null {
    if (this.channelUrl === channel.url && this.currentUrl) {
      if (this.video.paused) this.togglePause();
      return null;
    }
    this.activeSettings = sanitizePlayerSettings(this.readSettings());
    this.stop();
    this.manualQuality = false;
    this.channelUrl = channel.url;
    this.mirrorState = createMirrorState(channel);
    const refused = this.startStream(channel.url, forceHls);
    return refused && this.tryNextMirror() ? null : refused;
  }

  /** Зеркала и ручной повтор используют снимок настроек исходного запуска. */
  protected startStream(source: string, forceHls = false): string | null {
    const url = this.resolvePlayableUrl(source);
    const isHls = forceHls || /\.m3u8(\?|$)/i.test(url) || /[?&]type=m3u8/i.test(url);
    if (!isHls && /\.mpd(\?|$)/i.test(url)) return this.tr("player.dash");
    this.stopMedia();
    this.forceHls = forceHls;
    this.recovery = { networkRetries: 0, media: null };
    this.httpsFallbackTried = false;

    if (isHls && Hls.isSupported()) {
      this.connection = getNetworkConnection();
      this.connection?.addEventListener("change", this.refreshMobileQuality);
      // Новый hls-инстанс — новый поток: init прошлого не годится (#347).
      this.onStreamChange?.();
      this.hls = createHlsSession(url, this.video, this.activeSettings, {
        isCurrent: (hls) => this.hls === hls,
        onFatal: (error) => handleHlsFatal(error, this.recovery, {
          ...this.fatalContext,
          httpsUpgraded: () => this.httpsUpgraded,
          startLoad: () => this.hls?.startLoad(),
          recoverMediaError: () => this.hls?.recoverMediaError(),
        }, Date.now()),
        onManifest: () => {
          this.refreshMobileQuality();
          this.onHlsState?.();
        },
        onState: () => this.onHlsState?.(),
        onData: () => { this.recovery.networkRetries = 0; },
        onFragment: (payload, isInit) => this.onFragment?.(payload, isInit),
      });
    } else {
      // http progressive (mp4) или нативный HLS в Safari/iOS
      this.video.src = url;
    }

    this.currentUrl = url;
    this.volume.apply();
    // автоплей со звуком может быть заблокирован — юзер нажмёт play вручную
    this.video.play().catch(() => undefined);
    return null;
  }

  protected tryNextMirror(): boolean {
    if (!this.mirrorState || this.recordingUrls.length > 0) return false;
    let next = nextMirror(this.mirrorState);
    if (next) this.onMirrorChange?.();
    while (next) {
      this.mirrorState = next;
      if (!this.startStream(next.urls[next.index]!)) {
        this.onHlsState?.(); // убрать меню качества/дорожек старого источника
        return true;
      }
      next = nextMirror(next);
    }
    return false;
  }

  /** Проиграть запись из OPFS; MPEG-TS преобразуется существующим hls.js через MSE. */
  playRecording(file: Blob, ext: string, durationSec: number): string | null {
    this.stop();
    const sources = recordingSources(file, ext, durationSec, Hls.isSupported(), () => this.video.canPlayType("video/mp2t") !== "");
    if (!sources) return this.tr("error.recordTsUnsupported");
    const result = this.play({ url: sources.source }, sources.hls);
    this.recordingUrls = sources.urls;
    this.recordingDuration = durationSec;
    return result;
  }

  togglePause(): void {
    if (this.video.paused) {
      this.volume.apply();
      this.video.play().catch(() => undefined); // автоплей заблокирован — юзер повторит клик
    } else {
      this.video.pause();
    }
  }

  stop(): void {
    this.stopMedia();
    this.mirrorState = null;
    this.channelUrl = null;
    this.forceHls = false;
  }

  protected stopMedia(): void {
    this.subtitles.clear();
    this.volume.teardown();
    this.connection?.removeEventListener("change", this.refreshMobileQuality);
    this.connection = null;
    this.hls?.destroy();
    this.hls = null;
    this.video.removeAttribute("src");
    this.video.load();
    this.currentUrl = null;
    for (const url of this.recordingUrls) URL.revokeObjectURL(url);
    this.recordingUrls = [];
  }

  /** Перезапустить текущий поток с нуля (retry-кнопка). */
  retry(): void {
    if (!this.currentUrl || !this.mirrorState) return;
    this.mirrorState = { ...this.mirrorState, index: 0 };
    const recordingUrls = this.recordingUrls;
    this.recordingUrls = [];
    const refused = this.startStream(this.mirrorState.urls[0]!, this.forceHls);
    this.recordingUrls = recordingUrls;
    if (refused && !this.tryNextMirror()) {
      this.toast(refused);
      this.onFatalError?.();
    }
  }
}
