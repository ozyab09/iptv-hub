/**
 * Жизненный цикл hls.js-инстанса (вынесено в #376): создание, подписки на
 * ошибки, манифест, уровни/дорожки и загруженные сегменты. События старого
 * инстанса игнорируются (контракт #176): плеер говорит, текущий ли он.
 */
import Hls from "hls.js";
import { playerHlsConfig, type PlayerSettings } from "./player-settings";
import type { HlsFatalError } from "./player-diagnostics";

export interface HlsSessionHandlers {
  /** Этот инстанс всё ещё текущий у плеера? */
  isCurrent: (hls: Hls) => boolean;
  onFatal: (error: HlsFatalError) => void;
  onManifest: () => void;
  /** Уровни, дорожки или субтитры изменились — перерисовать меню. */
  onState: () => void;
  /** Пошли данные: прошлые сетевые сбои не в счёт. */
  onData: () => void;
  /** Загруженный сегмент; init fMP4 приходит отдельно перед фрагментом. */
  onFragment: (payload: ArrayBuffer, isInit: boolean) => void;
}

export function createHlsSession(url: string, video: HTMLVideoElement, settings: PlayerSettings, h: HlsSessionHandlers): Hls {
  const hls = new Hls(playerHlsConfig(settings));
  hls.loadSource(url);
  hls.attachMedia(video);
  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (!h.isCurrent(hls) || !data.fatal) return;
    const kind = data.type === Hls.ErrorTypes.NETWORK_ERROR ? "network" : data.type === Hls.ErrorTypes.MEDIA_ERROR ? "media" : "other";
    h.onFatal({ kind, details: data.details });
  });
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    if (h.isCurrent(hls)) h.onManifest();
  });
  for (const event of [Hls.Events.LEVEL_SWITCHED, Hls.Events.LEVEL_UPDATED, Hls.Events.AUDIO_TRACKS_UPDATED, Hls.Events.SUBTITLE_TRACKS_UPDATED] as const) {
    hls.on(event, () => h.onState());
  }
  // hls.js не шлёт FRAG_LOADED для init-сегмента fMP4: его байты лежат в
  // frag.initSegment.data медиафрагмента. Отдаём init перед фрагментом,
  // когда он сменился (старт потока, смена уровня, #347).
  let lastInit: Uint8Array | null = null;
  hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
    h.onData();
    const init = data.frag.initSegment?.data;
    if (init && init !== lastInit) {
      lastInit = init;
      h.onFragment(init.slice().buffer, true);
    }
    h.onFragment(data.payload, data.frag.sn === "initSegment");
  });
  return hls;
}
