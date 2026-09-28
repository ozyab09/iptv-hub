/**
 * Запись эфира в локальный файл.
 *
 * Здесь и чистые хелперы (имя файла, выбор mime, валидация состояния), и сам
 * жизненный цикл записи (`createRecordingSession`) — вынесенный из main.ts,
 * чтобы порядок остановки можно было покрыть тестами: именно он ломал
 * Firefox/Zen (issue #58).
 */

/** Внутреннее состояние записи. */
export type RecState = "idle" | "recording" | "stopping";

/** Интервал нарезки чанков, мс. */
const TIMESLICE_MS = 2000;

/** Сколько ждём событие stop, прежде чем сохранить накопленное самостоятельно. */
const STOP_TIMEOUT_MS = 3000;

/**
 * Имя файла записи: «Channel_2026-09-28_15-42.webm».
 * Небезопасные для ФС символы заменяются на «_».
 */
export function recordingFileName(channelName: string, at: Date = new Date()): string {
  const safe = channelName.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const pad = (n: number): string => String(n).padStart(2, "0");
  const ts = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}-${pad(at.getMinutes())}`;
  return `${safe || "recording"}_${ts}.webm`;
}

/**
 * Выбрать mime-тип под ФАКТИЧЕСКИЙ состав дорожек стрима.
 *
 * Firefox: если mime объявляет opus, а аудиодорожки в стриме нет, MediaRecorder
 * встаёт намертво — ни dataavailable, ни stop, ни файла. isTypeSupported при
 * этом возвращает true, то есть рассинхрон никак не детектируется, поэтому
 * кодеки выбираются по составу стрима, а не по «лучшему из поддерживаемых».
 */
export function pickRecorderMime(hasAudio: boolean): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = hasAudio
    ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]
    : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm", "video/mp4"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Можно ли вообще записывать в этом браузере (минимум — видео без звука). */
export function canRecord(): boolean {
  return typeof MediaRecorder !== "undefined" && pickRecorderMime(false) !== null;
}

/**
 * Валидация операции: стартовать можно из idle, останавливать — из recording.
 * Во время сохранения (`stopping`) запрещено и то, и другое.
 * Возвращает null (ok) или текст ошибки для тоста.
 */
export function validateRecOp(
  state: RecState,
  op: "start" | "stop",
): string | null {
  if (state === "stopping") return "Запись сохраняется, подождите";
  if (op === "start" && state === "recording") return "Запись уже идёт";
  if (op === "stop" && state !== "recording") return "Запись не запущена";
  return null;
}

/** Источник записи: стрим и снос того, что его питает (rAF-цикл, канвас). */
export interface RecordingSource {
  stream: MediaStream;
  dispose?: () => void;
}

/**
 * Минимальный контракт MediaRecorder, нужный сессии.
 * Реальный рекордер оборачивается адаптером в main.ts, тесты подставляют фейк.
 */
export interface RecorderLike {
  getState(): string;
  start(timesliceMs?: number): void;
  stop(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

/** Зависимости сессии: всё, что трогает DOM или браузерные API. */
export interface RecordingDeps {
  createSource: () => RecordingSource;
  createRecorder: (stream: MediaStream, mimeType: string) => RecorderLike;
  /** Готовый файл; blob.size === 0 означает, что записать не удалось. */
  onSave: (blob: Blob, chunkCount: number, mimeType: string) => void;
  onNotify: (message: string) => void;
  onState: (state: RecState) => void;
  /** Подмены для тестов. */
  pickMime?: (hasAudio: boolean) => string | null;
  stopTimeoutMs?: number;
}

export interface RecordingSession {
  start(): void;
  stop(save: boolean): void;
  state(): RecState;
  isRecording(): boolean;
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : "ошибка";
}

/**
 * Сессия записи с корректным порядком остановки.
 *
 * Главное правило: после `recorder.stop()` источник НЕ трогается. Gecko
 * досылает последний чанк и событие stop примерно через 16 мс, и снос канваса
 * или остановка треков в этом окне съедают и файл, и событие — ровно это
 * происходило в issue #58. Всё освобождение живёт в `finalize()`, который
 * вызывается только из onstop/onerror/watchdog.
 */
export function createRecordingSession(deps: RecordingDeps): RecordingSession {
  const pickMime = deps.pickMime ?? pickRecorderMime;
  const stopTimeoutMs = deps.stopTimeoutMs ?? STOP_TIMEOUT_MS;

  let state: RecState = "idle";
  let recorder: RecorderLike | null = null;
  let source: RecordingSource | null = null;
  let chunks: Blob[] = [];
  let mime = "";
  let saved = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  function setState(next: RecState): void {
    state = next;
    deps.onState(next);
  }

  function releaseSource(src: RecordingSource): void {
    src.stream.getTracks().forEach((t) => t.stop());
    src.dispose?.();
  }

  function finalize(): void {
    if (watchdog !== null) {
      clearTimeout(watchdog);
      watchdog = null;
    }
    if (source) releaseSource(source);
    source = null;
    recorder = null;
    setState("idle");
  }

  /** Отдать накопленное. Идемпотентно: watchdog и поздний onstop не дублируют файл. */
  function flush(): void {
    if (saved) return;
    saved = true;
    const collected = chunks;
    chunks = [];
    deps.onSave(new Blob(collected, { type: mime.split(";")[0] }), collected.length, mime);
  }

  return {
    state: () => state,
    isRecording: () => state === "recording",

    start(): void {
      const err = validateRecOp(state, "start");
      if (err) {
        deps.onNotify(err);
        return;
      }
      let created: RecordingSource;
      try {
        created = deps.createSource();
      } catch (e) {
        deps.onNotify(`Не удалось начать запись: ${reason(e)}`);
        return;
      }
      // mime выбирается ПОСЛЕ создания стрима — по его фактическим дорожкам.
      const picked = pickMime(created.stream.getAudioTracks().length > 0);
      if (picked === null) {
        releaseSource(created);
        deps.onNotify("Запись не поддерживается этим браузером");
        return;
      }
      let started: RecorderLike;
      try {
        started = deps.createRecorder(created.stream, picked);
      } catch (e) {
        releaseSource(created);
        deps.onNotify(`Не удалось начать запись: ${reason(e)}`);
        return;
      }
      started.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      started.onerror = (e) => {
        console.error("[iptv-hub] MediaRecorder error:", e);
        deps.onNotify("Ошибка записи (подробности в консоли F12)");
        finalize();
      };
      started.onstop = () => {
        flush();
        finalize();
      };
      try {
        started.start(TIMESLICE_MS);
      } catch (e) {
        releaseSource(created);
        deps.onNotify(`Не удалось начать запись: ${reason(e)}`);
        return;
      }
      recorder = started;
      source = created;
      mime = picked;
      chunks = [];
      saved = false;
      setState("recording");
    },

    stop(save: boolean): void {
      const err = validateRecOp(state, "stop");
      if (err) {
        deps.onNotify(err);
        return;
      }
      if (!save) {
        chunks = [];
        saved = true; // onstop не должен отдать файл
      }
      const active = recorder;
      if (!active || active.getState() === "inactive") {
        finalize();
        return;
      }
      setState("stopping");
      // Страховка: без неё отказ рекордера выглядит как полная тишина —
      // ни файла, ни сообщения (симптом, который чинили PR #40/#44/#46).
      watchdog = setTimeout(() => {
        watchdog = null;
        console.warn("[iptv-hub] rec: событие stop не пришло — сохраняем накопленное");
        flush();
        finalize();
      }, stopTimeoutMs);
      // Источник НЕ трогаем: его снесёт finalize() после onstop.
      active.stop();
    },
  };
}
