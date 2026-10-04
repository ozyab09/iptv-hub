/**
 * Захват для перекодирующей записи (MediaRecorder поверх captureStream) —
 * DOM-слой поверх recorder.ts (#366, паттерн #123).
 *
 * Жизненный цикл записи живёт в recorder.ts (createRecordingSession), здесь —
 * браузерная обвязка: источник кадров и адаптер MediaRecorder. Ограничения
 * из #58/#60 сохраняются: mime выбирает recorder.ts по фактическим дорожкам,
 * на Firefox для Android захват элемента роняет энкодер, а канвас отдаёт
 * черноту — тогда запись останавливается с явным сообщением.
 */
import { t, type Language, type TranslationKey } from "./i18n";
import type { RecorderLike, RecordingSource } from "./recorder";

/**
 * Способы получить стрим, от лучшего к самому неприхотливому. Сорвавшаяся
 * запись сдвигает указатель: на мобильном Firefox захват элемента отдаёт обе
 * дорожки, но энкодер через секунду падает с UnknownError, и единственный
 * способ это пережить — попробовать следующий вариант.
 */
export const SOURCE_STRATEGIES = ["element", "canvas-audio", "canvas-silent"] as const;
export type SourceStrategy = (typeof SOURCE_STRATEGIES)[number];

/** captureStream у <video> нестандартен: в Gecko он зовётся mozCaptureStream. */
type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export interface CaptureTimers {
  raf: (fn: () => void) => number;
  cancelRaf: (id: number) => void;
  setTimeout: (fn: () => void, ms: number) => void;
}

export interface RecordingCaptureDeps {
  video: HTMLVideoElement;
  /** Аудиодорожка текущего видео через общий Web Audio граф плеера. */
  captureAudioTrack: () => { track: MediaStreamTrack; release: () => void } | null;
  language: () => Language;
  /** Канвас не получает кадров: записывать нечего. */
  onNoFrames: () => void;
  createCanvas?: () => HTMLCanvasElement;
  timers?: CaptureTimers;
}

export interface RecordingCapture {
  /** Источник по текущей стратегии; без захвата элемента — сразу канвас. */
  createSource(): RecordingSource;
  /** Запись сорвалась: следующая стратегия или null, если пробовать нечего. */
  nextStrategy(): SourceStrategy | null;
  /** Каким путём пошла запись — показывается тостом, консоли на телефоне нет. */
  note(): string;
  resetNote(): void;
}

/**
 * Есть ли на канвасе непустые пиксели. null — прочитать не удалось
 * (кросс-доменное видео портит канвас, и getImageData бросает).
 */
export function canvasHasFrames(
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  ctx: Pick<CanvasRenderingContext2D, "getImageData">,
): boolean | null {
  const w = Math.min(64, canvas.width);
  const h = Math.min(64, canvas.height);
  try {
    const px = ctx.getImageData((canvas.width - w) >> 1, (canvas.height - h) >> 1, w, h).data;
    let max = 0;
    for (let i = 0; i < px.length; i += 4) {
      max = Math.max(max, px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0);
    }
    console.debug(`[iptv-hub] rec: проба канваса max=${max}`);
    return max > 0;
  } catch (e) {
    console.debug("[iptv-hub] rec: канвас испорчен CORS, проба невозможна:", e);
    return null;
  }
}

export function createRecordingCapture(deps: RecordingCaptureDeps): RecordingCapture {
  const tr = (key: TranslationKey): string => t(key, deps.language());
  const timers: CaptureTimers = deps.timers ?? {
    raf: (fn) => window.requestAnimationFrame(fn),
    cancelRaf: (id) => window.cancelAnimationFrame(id),
    setTimeout: (fn, ms) => void window.setTimeout(fn, ms),
  };
  const createCanvas = deps.createCanvas ?? (() => document.createElement("canvas"));
  let strategy = 0;
  let pathNote = "";

  /**
   * Прямой захват элемента. null — браузер его не умеет для текущего источника.
   *
   * mozCaptureStream — не запасной путь, а устаревший алиас того же API, поэтому
   * берётся ровно один из них: вторая попытка на том же элементе трогала бы уже
   * созданный захват.
   */
  function captureFromVideo(): RecordingSource | null {
    const v = deps.video as CapturableVideo;
    const capture = v.captureStream ?? v.mozCaptureStream;
    if (typeof capture !== "function") return null;
    try {
      const stream = capture.call(v);
      const [track] = stream.getVideoTracks();
      if (!track || track.readyState !== "live") {
        stream.getTracks().forEach((item) => item.stop());
        console.debug("[iptv-hub] rec: захват с <video> отдал мёртвую дорожку");
        return null;
      }
      const audio = stream.getAudioTracks().length;
      console.debug(`[iptv-hub] rec: захват с <video>, video=1 audio=${audio}`);
      pathNote = audio > 0 ? tr("record.withAudio") : tr("record.noAudio");
      return { stream };
    } catch (e) {
      console.debug("[iptv-hub] rec: захват с <video> не удался:", e);
      return null;
    }
  }

  /**
   * Фолбэк: картинка рисуется на канвас, звук добирается через Web Audio.
   * Работает там, где захват элемента невозможен, ценой rAF-цикла — то есть
   * записи нужна вкладка на переднем плане.
   */
  function captureFromCanvas(withAudio: boolean): RecordingSource {
    console.debug(`[iptv-hub] rec: запасной путь — канвас, звук=${withAudio}`);
    const video = deps.video;
    const canvas = createCanvas();
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d недоступен");
    let disposed = false;
    let raf = 0;
    // requestAnimationFrame вместо setInterval: Firefox/Zen троттлят setInterval
    // в фоне до 1/с, и captureStream(25) перестаёт получать кадры.
    const drawFrame = (): void => {
      if (disposed) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      raf = timers.raf(drawFrame);
    };
    drawFrame();
    let stream: MediaStream;
    try {
      stream = canvas.captureStream(25);
    } catch (e) {
      // иначе rAF-цикл остался бы крутиться без владельца
      disposed = true;
      timers.cancelRaf(raf);
      throw e;
    }
    // Firefox на Android держит декодированное видео в аппаратной поверхности,
    // недоступной канвасу: drawImage молча рисует черноту, звук при этом идёт.
    // Без проверки пользователь записал бы получасовой чёрный экран.
    // Две пробы с разносом: одиночный тёмный кадр не должен считаться отказом.
    let blackStrikes = 0;
    const probeCanvas = (): void => {
      if (disposed) return;
      const lit = canvasHasFrames(canvas, ctx);
      if (lit === null || lit) return; // прочитать не смогли или кадры есть
      if (++blackStrikes < 2) {
        timers.setTimeout(probeCanvas, 1500);
        return;
      }
      console.warn("[iptv-hub] rec: канвас не получает кадров — записывать нечего");
      deps.onNoFrames();
    };
    timers.setTimeout(probeCanvas, 1000);

    const audio = withAudio ? deps.captureAudioTrack() : null;
    if (audio) stream.addTrack(audio.track);
    pathNote = audio ? tr("record.fallbackAudio") : tr("record.fallbackSilent");
    const [track] = stream.getVideoTracks();
    console.debug(
      `[iptv-hub] rec: track=${track?.label ?? "?"} readyState=${track?.readyState} audio=${audio ? 1 : 0}`,
    );
    return {
      stream,
      dispose: () => {
        disposed = true;
        timers.cancelRaf(raf);
        audio?.release();
      },
    };
  }

  return {
    createSource() {
      if (SOURCE_STRATEGIES[strategy] === "element") {
        const direct = captureFromVideo();
        if (direct) return direct;
        strategy = 1; // захвата элемента нет — дальше только канвас
      }
      return captureFromCanvas(SOURCE_STRATEGIES[strategy] === "canvas-audio");
    },
    nextStrategy() {
      if (strategy >= SOURCE_STRATEGIES.length - 1) return null;
      strategy++;
      return SOURCE_STRATEGIES[strategy]!;
    },
    note: () => pathNote,
    resetNote() {
      pathNote = "";
    },
  };
}

/** Обёртка реального MediaRecorder в контракт сессии. */
export function createRecorderAdapter(
  stream: MediaStream,
  mimeType: string,
  Recorder: typeof MediaRecorder = MediaRecorder,
): RecorderLike {
  const rec = new Recorder(stream, { mimeType });
  const adapter: RecorderLike = {
    getState: () => rec.state,
    start: (timesliceMs) => rec.start(timesliceMs),
    stop: () => {
      console.debug(`[iptv-hub] rec: stop из state=${rec.state}`);
      rec.stop();
    },
    ondataavailable: null,
    onstop: null,
    onerror: null,
  };
  rec.ondataavailable = (e) => {
    console.debug(`[iptv-hub] rec: chunk ${e.data.size}B (${rec.state})`);
    adapter.ondataavailable?.({ data: e.data });
  };
  rec.onstop = () => adapter.onstop?.();
  rec.onerror = (ev) => adapter.onerror?.((ev as unknown as { error?: Error }).error);
  return adapter;
}
