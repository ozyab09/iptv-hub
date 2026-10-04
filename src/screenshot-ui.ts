/**
 * Скриншот кадра (FR-14) — DOM-слой поверх screenshot.ts (#364, паттерн #123).
 *
 * drawImage(<video>) → PNG. Через MSE кадр не «запачкан», у нативных
 * cross-origin потоков без CORS канвас tainted — браузер бросит при toBlob
 * или отдаст null, и мы честно сообщаем об ограничении. Узлы и зависимости
 * приходят через create — модуль ничего не ищет в документе сам.
 */
import { describeShotFailure, screenshotFileName } from "./screenshot";

/** Кадр, с которого снимаем: видео одиночного плеера или окна мульти-вью. */
export type ScreenshotFrame = CanvasImageSource & { videoWidth: number; videoHeight: number };

export interface ScreenshotUiDeps {
  button: HTMLButtonElement;
  /** Кадр активного плеера. */
  frame: () => ScreenshotFrame;
  /** Имя текущего канала или null, если ничего не играет. */
  channelName: () => string | null;
  toast: (message: string) => void;
  /** Сообщение об успешном сохранении на текущем языке. */
  savedMessage: () => string;
  createCanvas?: () => HTMLCanvasElement;
  download?: (blob: Blob, name: string) => void;
  now?: () => Date;
}

export interface ScreenshotUi {
  /** Снять кадр и отдать PNG в загрузки. */
  take(): void;
}

/** Классическое скачивание через a[download]; blob-URL живёт 10 секунд. */
function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function createScreenshotUi(deps: ScreenshotUiDeps): ScreenshotUi {
  const createCanvas = deps.createCanvas ?? (() => document.createElement("canvas"));
  const download = deps.download ?? downloadBlob;
  const now = deps.now ?? (() => new Date());
  const tainted = (): void => deps.toast(describeShotFailure("tainted"));

  function take(): void {
    const name = deps.channelName();
    if (name === null) return;
    const frame = deps.frame();
    if (!frame.videoWidth) {
      deps.toast(describeShotFailure("empty"));
      return;
    }
    const canvas = createCanvas();
    canvas.width = frame.videoWidth;
    canvas.height = frame.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frame, 0, 0);
    try {
      // toBlob для tainted-канваса в одних браузерах бросает SecurityError
      // синхронно, в других отдаёт null — покрыты оба варианта.
      canvas.toBlob((blob) => {
        if (!blob) {
          tainted();
          return;
        }
        download(blob, screenshotFileName(name, now()));
        deps.toast(deps.savedMessage());
      }, "image/png");
    } catch {
      tainted();
    }
  }

  deps.button.addEventListener("click", take);
  return { take };
}
