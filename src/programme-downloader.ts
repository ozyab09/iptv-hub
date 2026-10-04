import Hls from "hls.js";
import { Player } from "./player";
import { createSegmentSession } from "./segment-recorder";
import { createRecordingSink } from "./recording-sink";
import { addRecording } from "./recordings";
import {
  recordingFileName as storedRecordingName,
  type RecordingsFs,
} from "./recordings-store";
import type { EpgProgramme } from "./types";

/**
 * Скачивание одной передачи из архива (#315).
 *
 * Как запись по расписанию (#174): отдельный muted-плеер играет catchup-URL,
 * сегменты складываются как есть (segment-recorder), готовый файл — в
 * общую библиотеку записей. Основной плеер, ручная запись и расписание
 * не затрагиваются. Там, где сегментного пути нет (нет поддержки MSE),
 * пробуем обычное скачивание файла по URL.
 */

/** Скачивание идёт в один поток: вторая кнопка ждёт окончания первой. */
let active: Promise<boolean> | null = null;

/** Идёт ли сейчас скачивание передачи. */
export function isDownloading(): boolean {
  return active !== null;
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
  active = run(opts).finally(() => {
    active = null;
  });
  return active;
}

async function run(opts: DownloadProgrammeOpts): Promise<boolean> {
  const durationMs = Math.max(
    1_000,
    Date.parse(opts.programme.stop) - Date.parse(opts.programme.start),
  );
  if (Hls.isSupported()) return downloadSegments(opts, durationMs);
  return downloadDirect(opts);
}

/** Сегментный путь: muted-плеер + segment-recorder, файл в библиотеку. */
async function downloadSegments(
  opts: DownloadProgrammeOpts,
  durationMs: number,
): Promise<boolean> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.hidden = true;
  video.className = "programme-download-video";
  document.body.append(video);
  let failed = false;
  let saved = false;
  let saving: Promise<void> = Promise.resolve();
  const startedAt = Date.now();
  const player = new Player(video, opts.notify, undefined, () => {
    failed = true;
  });
  const session = createSegmentSession({
    createSink: () => createRecordingSink("download-rec-"),
    onNotify: opts.notify,
    onState: (state) => {
      if (state === "idle") failed = true;
    },
    onSave: (blob, result) => {
      saving = (async () => {
        const id = crypto.randomUUID();
        await opts.fs!.write(storedRecordingName(id, result.ext), blob);
        addRecording(localStorage, {
          id,
          channelName: opts.channelName,
          channelUrl: opts.channelUrl,
          programmeTitle: opts.programme.title,
          startedAt,
          durationSec: Math.max(0, (Date.now() - startedAt) / 1000),
          sizeBytes: blob.size,
          ext: result.ext,
        });
        saved = true;
        opts.onSaved();
      })().catch(() => {
        failed = true;
        opts.notify("Не удалось сохранить передачу");
      });
    },
  });
  await session.start();
  if (!session.isRecording()) {
    player.stop();
    video.remove();
    opts.notify("Хранилище записей недоступно");
    return false;
  }
  player.setFragmentListener((payload, init) => session.feed(payload, init), () => session.resetStream());
  const refused = player.play({ url: opts.url }, true);
  if (refused) {
    player.stop();
    await session.stop(false);
    video.remove();
    opts.notify(refused);
    return false;
  }

  // Передача конечна: заканчиваем по окончании воспроизведения либо по
  // таймауту (поток мог не сообщить конец). Запас — удвоенная длительность.
  const done = new Promise<void>((resolve) => {
    video.addEventListener("ended", () => resolve(), { once: true });
    setTimeout(resolve, durationMs * 2);
  });
  await done;
  const ok = !failed;
  player.stop();
  video.remove();
  await session.stop(ok);
  await saving;
  opts.notify(
    saved
      ? `Передача сохранена в библиотеку: ${opts.programme.title}`
      : `Не удалось скачать передачу: ${opts.programme.title}`,
  );
  return saved;
}

/**
 * Прямой путь (без MSE, например Safari со старым нативным архивом):
 * скачать файл по catchup-URL целиком и положить в библиотеку как mp4/ts.
 */
async function downloadDirect(opts: DownloadProgrammeOpts): Promise<boolean> {
  try {
    const res = await fetch(opts.url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const ext = blob.type.includes("mp4") ? "mp4" : "ts";
    const id = crypto.randomUUID();
    await opts.fs!.write(storedRecordingName(id, ext), blob);
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
      sizeBytes: blob.size,
      ext,
    });
    opts.onSaved();
    opts.notify(`Передача сохранена в библиотеку: ${opts.programme.title}`);
    return true;
  } catch {
    opts.notify(`Не удалось скачать передачу: ${opts.programme.title}`);
    return false;
  }
}
