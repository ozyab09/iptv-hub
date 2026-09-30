import Hls from "hls.js";
import { isMixedContent, isPrivateHost } from "./config";
import type { Channel } from "./types";
import { DEFAULT_PLAYER_SETTINGS, playerHlsConfig, sanitizePlayerSettings, type PlayerSettings } from "./player-settings";
import { recordingManifest } from "./recording-playback";
import { t } from "./i18n";

/**
 * Сколько подряд сетевых сбоев переживаем, прежде чем сдаться. Без предела
 * заблокированный или мёртвый поток крутит переподключение вечно, показывая
 * один и тот же тост и не давая пользователю понять, что канал не работает.
 */
const MAX_NETWORK_RETRIES = 3;

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
  /** Вызывается при фатальной ошибке потока (для retry-кнопки UI). */
  private onFatalError: (() => void) | null;
  /**
   * Вызывается на каждый загруженный сегмент — на этом строится запись эфира.
   * `payload` живёт только внутри вызова: hls.js отдаёт буфер в воркер
   * трансфером, после чего исходный ArrayBuffer отсоединяется. Сохранять
   * нужно копию.
   */
  private onFragment: ((payload: ArrayBuffer, isInit: boolean) => void) | null = null;
  /** Сетевые сбои подряд; сбрасывается, как только пошли данные. */
  private networkRetries = 0;
  /** https-апгрейд для текущего URL уже пробовали — второй раз не ждём. */
  private httpsFallbackTried = false;
  /** Текущий URL — результат https-апгрейда (для сообщений об ошибке). */
  private httpsUpgraded = false;
  private activeSettings: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS };
  private readSettings: () => PlayerSettings;
  /** Файл и локальный манифест живут до закрытия/смены записи, включая перемотку. */
  private recordingUrls: string[] = [];

  constructor(
    video: HTMLVideoElement,
    toast: (msg: string) => void,
    onHlsState?: () => void,
    onFatalError?: () => void,
    readSettings: () => PlayerSettings = () => ({ ...DEFAULT_PLAYER_SETTINGS }),
  ) {
    this.video = video;
    this.toast = toast;
    this.onHlsState = onHlsState ?? null;
    this.onFatalError = onFatalError ?? null;
    this.readSettings = readSettings;
    // Нативный playback (mp4/Safari): ошибки <video> — единственный канал
    // фатальных ошибок; через них же спасаем mixed content апгрейдом.
    this.video.addEventListener("error", this.handleVideoError);
  }

  /**
   * Подписаться на загружаемые сегменты. Подписка переживает смену канала:
   * обработчик вешается на каждый новый hls-инстанс.
   */
  setFragmentListener(cb: (payload: ArrayBuffer, isInit: boolean) => void): void {
    this.onFragment = cb;
  }

  /** Повесить обработчик сегментов на текущий hls-инстанс. */
  private attachFragmentListener(): void {
    this.hls?.on(Hls.Events.FRAG_LOADED, (_e, data) => {
      this.networkRetries = 0; // данные пошли — прошлые сбои не в счёт
      this.onFragment?.(data.payload, data.frag.sn === "initSegment");
    });
  }

  /**
   * URL для воспроизведения: при смешанном контенте (https-страница,
   * http-канал) пробуем https-порт того же хоста. Если апгрейд невозможен
   * (локальные/приватные адреса) — играем как есть: на http-странице это
   * работает, на https браузер заблокирует и сработает видео-ошибка.
   */
  private resolvePlayableUrl(url: string): string {
    this.httpsUpgraded = false;
    if (!isMixedContent(window.location.href, url)) return url;
    const upgraded = httpToHttps(url);
    if (!upgraded) return url;
    console.debug(`[iptv-hub] mixed content: пробую ${upgraded}`);
    this.httpsUpgraded = true;
    this.toast("http-канал на https-странице: пробую https…");
    return upgraded;
  }

  /**
   * Фатальная ошибка нативного <video> (MSE-путь репортит через
   * Hls.Events.ERROR). Последний шанс для mixed content: http-поток
   * заблокирован — пробуем https.
   */
  private handleVideoError = (): void => {
    if (this.hls || !this.currentUrl) return;
    if (this.recordingUrls.length > 0) {
      this.toast(t("error.recordPlayback"));
      this.onFatalError?.();
      return;
    }
    const err = this.video.error;
    console.debug(
      `[iptv-hub] native video error: code=${err?.code} ${err?.message ?? ""}`,
    );
    if (this.httpsFallbackTried) {
      this.toast("Поток не отвечает и по https — попробуйте другой канал");
      this.onFatalError?.();
      return;
    }
    const upgraded = httpToHttps(this.currentUrl);
    if (!upgraded) {
      this.toast(
        isMixedContent(window.location.href, this.currentUrl)
          ? "Канал отдаётся по http с адреса без TLS (локальный или приватный) — на https-странице браузер его не пропустит"
          : "Браузер не смог воспроизвести поток (подробности в консоли)",
      );
      this.onFatalError?.();
      return;
    }
    this.httpsFallbackTried = true;
    this.httpsUpgraded = true;
    this.toast("Поток заблокирован на https-странице — пробую https…");
    this.currentUrl = upgraded;
    this.video.src = upgraded;
    this.video.play().catch(() => undefined);
  };

  /**
   * Играть канал. null — попытка начата, строка — причина отказа (её и
   * показывает вызывающий; сам плеер про это не тостит, чтобы сообщения
   * не наслаивались).
   */
  play(channel: Pick<Channel, "url">, forceHls = false): string | null {
    // Смешанный контент: вместо немедленного отказа пробуем https-порт —
    // у большинства IPTV-CDN тот же контент доступен по TLS (issue #67).
    const url = this.resolvePlayableUrl(channel.url);
    if (this.currentUrl === url && !this.video.paused) return null;
    this.activeSettings = sanitizePlayerSettings(this.readSettings());
    this.stop();
    this.networkRetries = 0;
    this.httpsFallbackTried = false;

    const isHls = forceHls || /\.m3u8(\?|$)/i.test(url) || /[?&]type=m3u8/i.test(url);
    const isDash = /\.mpd(\?|$)/i.test(url);

    if (isHls && Hls.isSupported()) {
      this.hls = new Hls(playerHlsConfig(this.activeSettings));
      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);
      this.hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (this.recordingUrls.length > 0) {
          this.toast(t("error.recordPlayback"));
          this.onFatalError?.();
          return;
        }
        // Автовосстановление по типу ошибки (рекомендации hls.js):
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (!shouldRetryNetwork(++this.networkRetries)) {
            console.debug(`[iptv-hub] hls network error: ${data.details}, сдаёмся`);
            this.toast(
              this.httpsUpgraded
                ? "Поток недоступен и по https — у провайдера, похоже, нет TLS, и на https-странице браузер этот канал не пропустит"
                : "Поток не отвечает — попробуйте повтор или другой канал",
            );
            this.onFatalError?.();
            return;
          }
          // сеть/манифест: пробуем перезапустить загрузку
          console.debug(`[iptv-hub] hls network error: ${data.details}, restarting load`);
          this.hls?.startLoad();
          this.toast(`Сбой сети — переподключаемся (${this.networkRetries}/${MAX_NETWORK_RETRIES})…`);
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          console.debug(`[iptv-hub] hls media error: ${data.details}, recovering`);
          this.hls?.recoverMediaError();
          this.toast("Сбой декодирования — восстанавливаемся…");
          return;
        }
        // остальное — фатально: предлагаем ручной retry
        this.toast(`Ошибка потока: ${data.details ?? "unknown"}`);
        this.onFatalError?.();
      });
      const notify = (): void => this.onHlsState?.();
      this.hls.on(Hls.Events.MANIFEST_PARSED, notify);
      this.hls.on(Hls.Events.LEVEL_SWITCHED, notify);
      this.hls.on(Hls.Events.LEVEL_UPDATED, notify);
      this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, notify);
      this.hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, notify);
      this.attachFragmentListener();
    } else if (isDash) {
      return "MPEG-DASH не поддерживается в MVP (см. ROADMAP)";
    } else {
      // http progressive (mp4) или нативный HLS в Safari/iOS
      this.video.src = url;
    }

    this.currentUrl = url;
    this.video.play().catch(() => {
      // автоплей с звуком может быть заблокирован — юзер нажмёт play вручную
    });
    return null;
  }

  /** Проиграть запись из OPFS; MPEG-TS преобразуется существующим hls.js через MSE. */
  playRecording(file: Blob, ext: string, durationSec: number): string | null {
    this.stop();
    const ts = ext === "ts";
    const hls = ts && Hls.isSupported();
    if (ts && !hls && !this.video.canPlayType("video/mp2t")) {
      return t("error.recordTsUnsupported");
    }
    const mime = ts ? "video/mp2t" : ext === "mp4" ? "video/mp4" : "video/webm";
    const fileUrl = URL.createObjectURL(new Blob([file], { type: mime }));
    const urls = [fileUrl];
    let source = fileUrl;
    if (hls) {
      source = URL.createObjectURL(new Blob([recordingManifest(fileUrl, durationSec)], { type: "application/vnd.apple.mpegurl" }));
      urls.push(source);
    }
    const result = this.play({ url: source }, hls);
    this.recordingUrls = urls;
    return result;
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
    for (const url of this.recordingUrls) URL.revokeObjectURL(url);
    this.recordingUrls = [];
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

  /** Текущий URL потока (после https-апгрейда) — для диагностики фатальных ошибок. */
  get currentStreamUrl(): string | null {
    return this.currentUrl;
  }

  /** Таймаут снимка настроек текущего канала, независимо от редактирования UI. */
  get diagnosticsTimeoutMs(): number {
    return this.activeSettings.diagnosticsTimeoutMs;
  }

  /** Перезапустить текущий поток с нуля (retry-кнопка). */
  retry(): void {
    const url = this.currentUrl;
    if (!url) return;
    const isHls = this.hls !== null || /\.m3u8(\?|$)/i.test(url) || /[?&]type=m3u8/i.test(url);
    const channel: Channel = { url, name: "", normalizedName: "", tvgId: null, logo: null, group: "", quality: null, catchupDays: 0, catchupSource: null };
    const recordingUrls = this.recordingUrls;
    this.recordingUrls = [];
    this.stop();
    this.recordingUrls = recordingUrls;
    this.networkRetries = 0; // ручной повтор даёт потоку новый лимит попыток
    this.httpsFallbackTried = false;
    if (isHls && Hls.isSupported()) {
      this.hls = new Hls(playerHlsConfig(this.activeSettings));
      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);
      this.hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          this.toast(this.recordingUrls.length > 0
            ? t("error.recordPlayback")
            : `Ошибка потока: ${data.details ?? "unknown"}`);
          this.onFatalError?.();
        }
      });
      const notify = (): void => this.onHlsState?.();
      this.hls.on(Hls.Events.MANIFEST_PARSED, notify);
      this.hls.on(Hls.Events.LEVEL_SWITCHED, notify);
      this.hls.on(Hls.Events.LEVEL_UPDATED, notify);
      this.attachFragmentListener();
    } else {
      this.video.src = url;
    }
    this.currentUrl = url;
    this.video.play().catch(() => undefined);
    void channel;
  }
}

/**
 * Стоит ли ещё раз перезапускать загрузку после сетевого сбоя.
 * Вынесено из класса, чтобы предел попыток покрывался тестом без DOM и hls.js.
 */
export function shouldRetryNetwork(consecutiveFailures: number): boolean {
  return consecutiveFailures <= MAX_NETWORK_RETRIES;
}

/**
 * http→https для спасения потока на https-странице (mixed content).
 * Возвращает null, если апгрейд не имеет смысла: URL не http, кривой,
 * или адрес локальный/приватный (localhost, RFC1918) — у таких хостов
 * TLS на 443 обычно не поднят. Чистая функция — покрыта тестами.
 */
export function httpToHttps(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:") return null;
    // Исключения для локальных/приватных адресов — общий предикат с фильтром
    // http-каналов в m3u.ts, чтобы оба решения не разъехались.
    if (isPrivateHost(u.hostname)) return null;
    u.protocol = "https:";
    if (u.port === "80") u.port = ""; // :80 → дефолтный https-порт 443
    return u.toString();
  } catch {
    return null;
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
