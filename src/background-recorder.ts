/**
 * Фоновая запись в библиотеку (#377): отдельный muted-плеер + сегментная
 * сессия + OPFS-приёмник + сохранение готового файла. Общий движок для
 * записи по расписанию (#174) и скачивания передачи из архива (#315).
 * Основной плеер и ручная запись не затрагиваются.
 *
 * Рабочие файлы изолированы префиксом: ручная запись — `rec-`, расписание —
 * `schedule-rec-`, скачивание — `download-rec-`; сборка мусора приёмника
 * удаляет только файлы своего префикса.
 */
import { Player } from "./player";
import { createSegmentSession } from "./segment-recorder";
import { createRecordingSink } from "./recording-sink";
import { addRecording } from "./recordings";
import { recordingFileName as storedRecordingName, type RecordingsFs } from "./recordings-store";

/** Префиксы рабочих файлов фоновых записей (ручная запись — `rec-`). */
export const BACKGROUND_PREFIXES = { schedule: "schedule-rec-", download: "download-rec-" } as const;
export type BackgroundKind = keyof typeof BACKGROUND_PREFIXES;

/** Хранилище записей недоступно: сессия не стартовала. */
export const SINK_UNAVAILABLE = "Recording sink unavailable";

export interface BackgroundRecorderOpts {
  kind: BackgroundKind;
  /** Класс скрытого <video> — по нему спеки и стили находят фоновый плеер. */
  videoClass: string;
  url: string;
  fs: RecordingsFs;
  channelName: string;
  channelUrl: string;
  programmeTitle: string;
  /** Момент, дальше которого длительность записи не считается (конец слота). */
  endAt?: number;
  notify: (message: string) => void;
  onSaved: () => void;
  /** Сообщение, если готовый файл не удалось положить в библиотеку. */
  saveFailedMessage: string;
}

export interface BackgroundRecorder {
  video: HTMLVideoElement;
  /** Поток или хранилище сорвались. */
  failed(): boolean;
  /** Остановить: save — сохранить в библиотеку, иначе бросить рабочий файл. true — сохранено. */
  stop(save: boolean): Promise<boolean>;
}

/**
 * Запустить фоновую запись. Бросает Error: SINK_UNAVAILABLE или причину
 * отказа плеера (например, MPEG-DASH) — вызывающий сообщает её по-своему.
 */
export async function startBackgroundRecorder(opts: BackgroundRecorderOpts): Promise<BackgroundRecorder> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.hidden = true;
  video.className = opts.videoClass;
  document.body.append(video);
  let failed = false;
  let stopping = false;
  let saved = false;
  let saving: Promise<void> = Promise.resolve();
  const startedAt = Date.now();
  const player = new Player(video, opts.notify, undefined, () => { failed = true; });
  const session = createSegmentSession({
    createSink: () => createRecordingSink(BACKGROUND_PREFIXES[opts.kind]),
    onNotify: opts.notify,
    // Сессия сама ушла в idle (потолок, сбой хранилища) — это срыв, а не остановка.
    onState: (state) => { if (state === "idle" && !stopping) failed = true; },
    onSave: (blob, result) => {
      saving = (async () => {
        const id = crypto.randomUUID();
        await opts.fs.write(storedRecordingName(id, result.ext), blob);
        const endedAt = Math.min(Date.now(), opts.endAt ?? Infinity);
        addRecording(localStorage, {
          id, channelName: opts.channelName, channelUrl: opts.channelUrl, programmeTitle: opts.programmeTitle, startedAt,
          durationSec: Math.max(0, (endedAt - startedAt) / 1000), sizeBytes: blob.size, ext: result.ext,
        });
        saved = true;
        opts.onSaved();
      })().catch(() => {
        failed = true;
        opts.notify(opts.saveFailedMessage);
      });
    },
  });
  await session.start();
  if (!session.isRecording()) {
    player.stop();
    video.remove();
    throw new Error(SINK_UNAVAILABLE);
  }
  player.setFragmentListener((payload, init) => session.feed(payload, init), () => session.resetStream());
  const refused = player.play({ url: opts.url }, true);
  if (refused) {
    await session.stop(false);
    player.stop();
    video.remove();
    throw new Error(refused);
  }
  return {
    video,
    failed: () => failed,
    async stop(save) {
      stopping = true;
      player.stop();
      video.remove();
      // save=false бросает приёмник и удаляет рабочий файл из OPFS.
      await session.stop(save);
      await saving;
      return saved;
    },
  };
}
