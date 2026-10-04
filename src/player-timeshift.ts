/**
 * Перемотка и timeshift-буфер живого HLS (#175, вынесено в #376).
 * Пауза и отставание продолжают качать сегменты до TIMESHIFT_BUFFER_SECONDS;
 * «К эфиру» возвращает буфер снимка настроек. Навигация по списку — здесь же.
 */
import type Hls from "hls.js";
import { TIMESHIFT_BUFFER_SECONDS } from "./player-settings";
import { bufferedSeekTarget } from "./scrub";

type LiveHls = Pick<Hls, "config" | "latestLevelDetails" | "liveSyncPosition">;

/** Живой поток hls.js? */
export function isLiveHls(hls: LiveHls | null): boolean {
  return !!hls?.latestLevelDetails?.live;
}

/** На паузе и при отставании продолжаем скачивать живые сегменты. */
export function enableTimeshift(hls: LiveHls | null, maxBufferLength: number): void {
  if (hls && isLiveHls(hls)) hls.config.maxBufferLength = Math.max(maxBufferLength, TIMESHIFT_BUFFER_SECONDS);
}

/** Край живого буфера: из плейлиста hls.js, иначе конец seekable. */
export function liveEdgeOf(hls: LiveHls | null, video: HTMLVideoElement): number {
  if (hls && isLiveHls(hls)) return hls.latestLevelDetails!.edge;
  const ranges = video.seekable;
  return ranges.length > 0 ? ranges.end(ranges.length - 1) : NaN;
}

/** Вернуться к эфиру: позиция синхронизации, обычный буфер настроек. */
export function goLive(hls: LiveHls | null, video: HTMLVideoElement, maxBufferLength: number): void {
  const target = hls && isLiveHls(hls) ? hls.liveSyncPosition : liveEdgeOf(hls, video);
  if (target === null || !Number.isFinite(target)) return;
  if (hls) hls.config.maxBufferLength = maxBufferLength;
  video.currentTime = Math.max(0, target - 0.1);
  video.play().catch(() => undefined);
}

/**
 * Соседний индекс по списку каналов с зацикливанием.
 * Возвращает null, если список пуст.
 */
export function neighborIndex(current: number, length: number, step: 1 | -1): number | null {
  if (length <= 0) return null;
  return (((current + step) % length) + length) % length;
}

/**
 * Цель перемотки ±сек. Для live цель ищется отдельно в bufferedSeekTarget;
 * здесь возвращаем null. Выход за [0, duration] обрезается к границе.
 */
export function skipTarget(current: number, deltaSec: number, duration: number, isLive: boolean): number | null {
  if (isLive) return null;
  if (!Number.isFinite(current)) return null;
  const target = current + deltaSec;
  const max = Number.isFinite(duration) && duration > 0 ? duration : current;
  return Math.min(Math.max(target, 0), max);
}

/** Перемотать видео на ±сек (учитывает live-режим). */
export function seekBy(video: HTMLVideoElement, deltaSec: number, live = !Number.isFinite(video.duration) || video.duration === 0): void {
  const ranges = live ? Array.from({ length: video.buffered.length }, (_, i) => ({ start: video.buffered.start(i), end: video.buffered.end(i) })) : [];
  const target = live ? bufferedSeekTarget(video.currentTime, deltaSec, ranges) : skipTarget(video.currentTime, deltaSec, video.duration, false);
  if (target !== null) video.currentTime = target;
}
