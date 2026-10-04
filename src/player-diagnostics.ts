/**
 * Фатальные ошибки потока (вынесено в #376): что делать после ошибки hls.js
 * или нативного <video> — зеркало, переподключение, лечение декодера,
 * https-апгрейд или фатальный UI с внятной причиной. Плеер передаёт
 * контекст действиями, модуль не знает его внутреннего устройства.
 */
import { isMixedContent } from "./config";
import type { TranslationKey, TranslationParams } from "./i18n";
import { httpToHttps, MAX_NETWORK_RETRIES, nextMediaRecovery, shouldRecoverMedia, shouldRetryNetwork, type MediaRecoveryState } from "./player-recovery";

export interface FatalContext {
  tr: (key: TranslationKey, params?: TranslationParams) => string;
  toast: (message: string) => void;
  /** Показать фатальный UI (retry, ссылка на поток). */
  fatal: () => void;
  /** Играет локальная запись: сетевые спасения неприменимы. */
  isRecording: () => boolean;
  /** Переключиться на следующее зеркало; true — переключились. */
  tryNextMirror: () => boolean;
}

export interface HlsRecoveryState {
  networkRetries: number;
  media: MediaRecoveryState | null;
}

export interface HlsFatalActions extends FatalContext {
  /** Текущий URL — результат https-апгрейда. */
  httpsUpgraded: () => boolean;
  startLoad: () => void;
  recoverMediaError: () => void;
}

/** Вид фатальной ошибки hls.js после сопоставления с Hls.ErrorTypes. */
export interface HlsFatalError {
  kind: "network" | "media" | "other";
  details?: string;
}

/** Фатальная ошибка hls.js: переподключение, лечение декодера или фатальный UI. */
export function handleHlsFatal(
  error: HlsFatalError,
  state: HlsRecoveryState,
  ctx: HlsFatalActions,
  now: number,
): void {
  if (ctx.isRecording()) {
    ctx.toast(ctx.tr("error.recordPlayback"));
    ctx.fatal();
    return;
  }
  if (ctx.tryNextMirror()) return;
  // Автовосстановление по типу ошибки (рекомендации hls.js):
  if (error.kind === "network") {
    if (!shouldRetryNetwork(++state.networkRetries)) {
      console.debug(`[iptv-hub] hls network error: ${error.details}, сдаёмся`);
      ctx.toast(ctx.httpsUpgraded() ? ctx.tr("player.noTls") : ctx.tr("player.unavailable"));
      ctx.fatal();
      return;
    }
    // сеть/манифест: пробуем перезапустить загрузку
    console.debug(`[iptv-hub] hls network error: ${error.details}, restarting load`);
    ctx.startLoad();
    ctx.toast(ctx.tr("player.reconnecting", { attempt: state.networkRetries, max: MAX_NETWORK_RETRIES }));
    return;
  }
  if (error.kind === "media") {
    state.media = nextMediaRecovery(state.media, now);
    if (!shouldRecoverMedia(state.media.count)) {
      console.debug(`[iptv-hub] hls media error: ${error.details}, сдаёмся`);
      ctx.toast(ctx.tr("player.streamError", { reason: error.details ?? "media error" }));
      ctx.fatal();
      return;
    }
    console.debug(`[iptv-hub] hls media error: ${error.details}, recovering`);
    ctx.recoverMediaError();
    ctx.toast(ctx.tr("player.decoding"));
    return;
  }
  // остальное — фатально: предлагаем ручной retry
  ctx.toast(ctx.tr("player.streamError", { reason: error.details ?? "unknown" }));
  ctx.fatal();
}

export interface NativeFatalActions extends FatalContext {
  /** https уже пробовали для этого URL. */
  httpsTried: () => boolean;
  /** Переключить элемент на https-адрес. */
  upgrade: (url: string) => void;
}

/**
 * Фатальная ошибка нативного <video> (MSE-путь репортит через hls.js).
 * Последний шанс для mixed content: http-поток заблокирован — пробуем https.
 */
export function handleNativeFatal(url: string, ctx: NativeFatalActions, pageUrl: string): void {
  if (ctx.isRecording()) {
    ctx.toast(ctx.tr("error.recordPlayback"));
    ctx.fatal();
    return;
  }
  if (ctx.tryNextMirror()) return;
  if (ctx.httpsTried()) {
    ctx.toast(ctx.tr("player.httpsFailed"));
    ctx.fatal();
    return;
  }
  const upgraded = httpToHttps(url);
  if (!upgraded) {
    ctx.toast(isMixedContent(pageUrl, url) ? ctx.tr("player.privateHttp") : ctx.tr("player.nativeFailed"));
    ctx.fatal();
    return;
  }
  ctx.toast(ctx.tr("player.blockedUpgrade"));
  ctx.upgrade(upgraded);
}
