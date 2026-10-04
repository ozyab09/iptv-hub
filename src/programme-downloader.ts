import Hls from "hls.js";
import { BACKGROUND_PREFIXES, SINK_UNAVAILABLE, startBackgroundRecorder, type BackgroundRecorder } from "./background-recorder";
import { createRecordingSink } from "./recording-sink";
import { addRecording } from "./recordings";
import {
  recordingFileName as storedRecordingName,
  type RecordingsFs,
} from "./recordings-store";
import { pipeStreamToSink } from "./stream-sink";
import type { EpgProgramme } from "./types";

/**
 * Скачивание одной передачи из архива (#315).
 *
 * Как запись по расписанию (#174): отдельный muted-плеер играет catchup-URL,
 * сегменты складываются как есть (segment-recorder), готовый файл — в
 * общую библиотеку записей. Основной плеер, ручная запись и расписание
 * не затрагиваются. Там, где сегментного пути нет (нет поддержки MSE),
 * файл по URL скачивается потоком в OPFS.
 *
 * Состояние (#359): прогресс и отмена доступны UI через downloadStatus()
 * и cancelDownload(); отмена бросает рабочий файл.
 */

/** Скачивание идёт в один поток: вторая кнопка ждёт окончания первой. */
let active: Promise<boolean> | null = null;
let status: DownloadStatus | null = null;
let cancelActive: (() => void) | null = null;

/** Что скачивается сейчас и насколько продвинулось. */
export interface DownloadStatus {
  channelName: string;
  /** Канал и начало передачи — по ним UI узнаёт свою кнопку. */
  channelUrl: string;
  start: string;
  title: string;
  url: string;
  /** Доля 0…1; для прямого пути без content-length — 0. */
  progress: number;
}

/** Идёт ли сейчас скачивание передачи. */
export function isDownloading(): boolean {
  return active !== null;
}

/** Текущее скачивание или null. */
export function downloadStatus(): DownloadStatus | null {
  return status;
}

/** Отменить текущее скачивание: фоновый плеер останавливается, файл не сохраняется. */
export function cancelDownload(): void {
  cancelActive?.();
}

export interface DownloadProgrammeOpts {
  channelName: string;
  channelUrl: string;
  programme: EpgProgramme;
  /** Готовый catchup-URL (то, что гайд отдал бы плееру). */
  url: string;
  fs: RecordingsFs | null;
  storage: Storage;
  notify: (message: string) => void;
  onSaved: () => void;
  /** Изменилось состояние: старт, прогресс, завершение или отмена. */
  onStatus?: () => void;
}

/**
 * Скачать передачу в библиотеку. Возвращает true, если файл сохранён.
 * Параллельный вызов отклоняется с тостом, не ломая идущее скачивание.
 */
export function downloadProgramme(opts: DownloadProgrammeOpts): Promise<boolean> {
  if (active) {
    opts.notify("Скачивание уже идёт — дождитесь завершения");
    return Promise.resolve(false);
  }
  if (!opts.fs) {
    opts.notify("Локальное хранилище недоступно — скачивание невозможно");
    return Promise.resolve(false);
  }
  status = {
    channelName: opts.channelName,
    channelUrl: opts.channelUrl,
    start: opts.programme.start,
    title: opts.programme.title,
    url: opts.url,
    progress: 0,
  };
  active = run(opts).finally(() => {
    active = null;
    status = null;
    cancelActive = null;
    opts.onStatus?.();
  });
  opts.onStatus?.();
  return active;
}

function setProgress(opts: DownloadProgrammeOpts, progress: number): void {
  if (!status) return;
  const next = Math.min(1, Math.max(0, progress));
  if (Math.abs(next - status.progress) < 0.005) return;
  status = { ...status, progress: next };
  opts.onStatus?.();
}

async function run(opts: DownloadProgrammeOpts): Promise<boolean> {
  const durationMs = Math.max(
    1_000,
    Date.parse(opts.programme.stop) - Date.parse(opts.programme.start),
  );
  if (Hls.isSupported()) return downloadSegments(opts, durationMs);
  return downloadDirect(opts);
}

/** Сегментный путь: общий фоновый движок (background-recorder.ts), файл в библиотеку. */
async function downloadSegments(
  opts: DownloadProgrammeOpts,
  durationMs: number,
): Promise<boolean> {
  let recorder: BackgroundRecorder;
  try {
    recorder = await startBackgroundRecorder({
      kind: "download",
      videoClass: "programme-download-video",
      url: opts.url,
      fs: opts.fs!,
      channelName: opts.channelName,
      channelUrl: opts.channelUrl,
      programmeTitle: opts.programme.title,
      notify: opts.notify,
      onSaved: opts.onSaved,
      saveFailedMessage: "Не удалось сохранить передачу",
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    opts.notify(reason === SINK_UNAVAILABLE ? "Хранилище записей недоступно" : reason);
    return false;
  }
  const video = recorder.video;
  let cancelled = false;
  video.addEventListener("timeupdate", () => setProgress(opts, (video.currentTime * 1000) / durationMs));

  // Передача конечна: заканчиваем по окончании воспроизведения, по отмене
  // либо по таймауту (поток мог не сообщить конец). Запас — удвоенная длительность.
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, durationMs * 2);
    video.addEventListener("ended", () => resolve(), { once: true });
    cancelActive = () => {
      cancelled = true;
      clearTimeout(timer);
      resolve();
    };
  });
  // Отмена бросает приёмник и удаляет рабочий файл из OPFS.
  const saved = await recorder.stop(!recorder.failed() && !cancelled);
  if (cancelled) return false;
  opts.notify(
    saved
      ? `Передача сохранена в библиотеку: ${opts.programme.title}`
      : `Не удалось скачать передачу: ${opts.programme.title}`,
  );
  return saved;
}

/**
 * Прямой путь (без MSE, например Safari со старым нативным архивом):
 * тело ответа потоком уходит в OPFS (#359), затем файл — в библиотеку.
 */
async function downloadDirect(opts: DownloadProgrammeOpts): Promise<boolean> {
  const controller = new AbortController();
  cancelActive = () => controller.abort();
  const sink = await createRecordingSink(BACKGROUND_PREFIXES.download);
  try {
    const res = await fetch(opts.url, { signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(String(res.status));
    const total = Number(res.headers.get("content-length") ?? 0);
    await pipeStreamToSink(
      res.body,
      sink,
      (bytes) => { if (total > 0) setProgress(opts, bytes / total); },
      controller.signal,
    );
    const file = await sink.finish();
    const ext = (res.headers.get("content-type") ?? "").includes("mp4") ? "mp4" : "ts";
    const id = crypto.randomUUID();
    await opts.fs!.write(storedRecordingName(id, ext), file);
    addRecording(localStorage, {
      id,
      channelName: opts.channelName,
      channelUrl: opts.channelUrl,
      programmeTitle: opts.programme.title,
      startedAt: Date.now(),
      durationSec: Math.max(
        0,
        (Date.parse(opts.programme.stop) - Date.parse(opts.programme.start)) /
          1000,
      ),
      sizeBytes: file.size,
      ext,
    });
    opts.onSaved();
    opts.notify(`Передача сохранена в библиотеку: ${opts.programme.title}`);
    return true;
  } catch {
    await sink.abort();
    if (!controller.signal.aborted) opts.notify(`Не удалось скачать передачу: ${opts.programme.title}`);
    return false;
  }
}
