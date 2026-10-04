import { t, type Language, type TranslationKey, type TranslationParams } from "./i18n";
/**
 * Запись эфира готовыми сегментами HLS.
 *
 * hls.js и так скачивает сегменты потока. Вместо того чтобы перерисовывать
 * декодированное видео на канвас и кодировать заново, складываем эти сегменты
 * как есть: оригинальное качество, нулевая нагрузка на CPU, родной звук.
 * Главное — не нужны ни канвас, ни MediaRecorder, на которых спотыкается
 * Firefox для Android (#58, #60).
 */

export type SegmentRecState = "idle" | "recording" | "saving";

/** Куда складываются сегменты. Реализации живут в recording-sink.ts. */
export interface RecordingSink {
  /** Вид хранилища — для диагностики в логе. */
  readonly kind: string;
  /** Поставить кусок в очередь записи (не блокирует). */
  write(chunk: ArrayBuffer): void;
  /** Сколько байт принято. */
  size(): number;
  /** Ошибка записи, если была: кончилась квота, отвалилось хранилище. */
  error(): Error | null;
  /** Дописать и отдать готовый файл. */
  finish(): Promise<Blob>;
  /** Бросить запись и убрать за собой. */
  abort(): Promise<void>;
}

/** Контейнер сегментов: HLS бывает и в MPEG-TS, и в fragmented MP4. */
export type Container = "ts" | "mp4" | "unknown";

/**
 * Определить контейнер по первым байтам сегмента.
 * MPEG-TS начинается с sync-байта 0x47, fMP4 — с бокса ftyp/styp/moof.
 */
export function detectContainer(head: Uint8Array): Container {
  if (head.length === 0) return "unknown";
  if (head[0] === 0x47) return "ts";
  if (head.length >= 8) {
    let tag = "";
    for (let i = 4; i < 8; i++) tag += String.fromCharCode(head[i] ?? 0);
    if (tag === "ftyp" || tag === "styp" || tag === "moof") return "mp4";
  }
  return "unknown";
}

/** Расширение файла для контейнера. Неопознанное пишем как .ts — это чаще. */
export function containerExt(c: Container): string {
  return c === "mp4" ? "mp4" : "ts";
}

/** Сведения о завершённой записи. */
export interface SegmentResult {
  bytes: number;
  segments: number;
  ext: string;
  sink: string;
}

export interface SegmentRecorderDeps {
  /** Создать приёмник. Вызывается на каждый старт. */
  createSink: () => Promise<RecordingSink>;
  onSave: (blob: Blob, result: SegmentResult) => void;
  onNotify: (message: string) => void;
  language?: () => Language;
  onState: (state: SegmentRecState) => void;
  /** Потолок размера; по достижении запись останавливается сама. */
  maxBytes?: number;
}

export interface SegmentSession {
  start(): Promise<void>;
  stop(save: boolean): Promise<void>;
  /**
   * Принять загруженный сегмент. Буфер копируется здесь же: hls.js передаёт
   * его в воркер трансфером, после чего исходный ArrayBuffer отсоединяется.
   */
  feed(payload: ArrayBuffer, isInit: boolean): void;
  state(): SegmentRecState;
  isRecording(): boolean;
}

/** Гигабайт: дальше запись останавливается сама, чтобы не выесть хранилище. */
const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;

export function createSegmentSession(deps: SegmentRecorderDeps): SegmentSession {
  const tr = (key: TranslationKey, params: TranslationParams = {}) => t(key, deps.language?.() ?? "ru", params);
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;

  let state: SegmentRecState = "idle";
  let sink: RecordingSink | null = null;
  let segments = 0;
  let container: Container = "unknown";
  /**
   * Последний init-сегмент потока. Для fMP4 без него файл нечитаем, а грузится
   * он один раз в начале воспроизведения — задолго до старта записи, поэтому
   * держим его всегда, независимо от состояния.
   */
  let lastInit: ArrayBuffer | null = null;

  function setState(next: SegmentRecState): void {
    state = next;
    deps.onState(next);
  }

  function put(chunk: ArrayBuffer): void {
    if (!sink) return;
    if (container === "unknown") {
      container = detectContainer(new Uint8Array(chunk.slice(0, 16)));
      console.debug(`[iptv-hub] seg: контейнер=${container}`);
    }
    sink.write(chunk);
  }

  return {
    state: () => state,
    isRecording: () => state === "recording",

    feed(payload: ArrayBuffer, isInit: boolean): void {
      if (isInit) {
        lastInit = payload.slice(0);
        return;
      }
      if (state !== "recording" || !sink) return;
      put(payload.slice(0));
      segments++;
      const failure = sink.error();
      if (failure) {
        deps.onNotify(tr("record.interrupted", { reason: failure.message }));
        void this.stop(true);
        return;
      }
      if (sink.size() >= maxBytes) {
        deps.onNotify(tr("record.limit"));
        void this.stop(true);
      }
    },

    async start(): Promise<void> {
      if (state !== "idle") {
        deps.onNotify(state === "recording" ? tr("record.already") : tr("record.saving"));
        return;
      }
      try {
        sink = await deps.createSink();
      } catch (e) {
        deps.onNotify(
          tr("record.startFailed", { reason: e instanceof Error ? e.message : tr("error.unknown") }),
        );
        return;
      }
      segments = 0;
      container = "unknown";
      console.debug(`[iptv-hub] seg: старт, хранилище=${sink.kind}`);
      // init-сегмент должен лечь первым, иначе fMP4 не прочитается.
      if (lastInit) put(lastInit.slice(0));
      setState("recording");
    },

    async stop(save: boolean): Promise<void> {
      if (state !== "recording" || !sink) {
        if (state === "idle") deps.onNotify(tr("record.notStarted"));
        return;
      }
      const active = sink;
      setState("saving");
      if (!save) {
        sink = null;
        await active.abort();
        setState("idle");
        return;
      }
      try {
        const blob = await active.finish();
        sink = null;
        setState("idle");
        if (blob.size === 0 || segments === 0) {
          deps.onNotify(tr("record.noSegments"));
          return;
        }
        deps.onSave(blob, {
          bytes: blob.size,
          segments,
          ext: containerExt(container),
          sink: active.kind,
        });
      } catch (e) {
        sink = null;
        setState("idle");
        deps.onNotify(
          tr("record.saveFailed", { reason: e instanceof Error ? e.message : tr("error.unknown") }),
        );
      }
    },
  };
}
