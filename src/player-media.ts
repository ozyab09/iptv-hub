/**
 * Окружение плеера (вынесено в #376): сеть для мобильного ограничения
 * качества (#300) и Picture-in-Picture.
 */
import type Hls from "hls.js";
import { mobileQualityCap, needsMobileQualityCap, type ConnectionInfo } from "./mobile-quality";
import type { PlayerSettings } from "./player-settings";

export type NetworkConnection = EventTarget & ConnectionInfo;

export function getNetworkConnection(): NetworkConnection | null {
  return typeof navigator === "undefined" ? null : (navigator as Navigator & { connection?: NetworkConnection }).connection ?? null;
}

/**
 * Потолок Auto-качества: ручной выбор и локальные записи не ограничиваются,
 * иначе — по типу сети и настройкам. -1 = без ограничения.
 */
export function autoLevelCap(
  hls: Pick<Hls, "levels">,
  settings: Pick<PlayerSettings, "limitMobileQuality" | "mobileMaxHeight">,
  connection: ConnectionInfo | null,
  manual: boolean,
  url: string | null,
): number {
  return !manual && !url?.startsWith("blob:") && needsMobileQualityCap(settings.limitMobileQuality, connection)
    ? mobileQualityCap(hls.levels, settings.mobileMaxHeight) : -1;
}

/** Picture-in-Picture. False — API недоступен или отказано (тост — у вызывающего). */
export async function togglePictureInPicture(video: HTMLVideoElement): Promise<"unsupported" | "failed" | "ok"> {
  if (!document.pictureInPictureEnabled) return "unsupported";
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
    return "ok";
  } catch {
    return "failed";
  }
}
