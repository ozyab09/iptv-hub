import { describe, expect, it } from "vitest";
import { createScreenshotUi, type ScreenshotFrame } from "../src/screenshot-ui";
import { describeShotFailure } from "../src/screenshot";

type Mode = "ok" | "null" | "throw";

function harness(opts: { mode?: Mode; width?: number; channel?: string | null } = {}) {
  const toasts: string[] = [];
  const downloads: { size: number; name: string }[] = [];
  const drawn: unknown[] = [];
  let click: (() => void) | null = null;
  const button = {
    addEventListener: (type: string, fn: () => void) => { if (type === "click") click = fn; },
  } as unknown as HTMLButtonElement;
  const frame = { videoWidth: opts.width ?? 160, videoHeight: 90 } as unknown as ScreenshotFrame;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (src: unknown) => drawn.push(src) }),
    toBlob(cb: (blob: Blob | null) => void) {
      if (opts.mode === "throw") throw new DOMException("tainted", "SecurityError");
      cb(opts.mode === "null" ? null : new Blob([new Uint8Array(4)]));
    },
  } as unknown as HTMLCanvasElement;
  const ui = createScreenshotUi({
    button,
    frame: () => frame,
    channelName: () => (opts.channel === undefined ? "Кино HD" : opts.channel),
    toast: (m) => toasts.push(m),
    savedMessage: () => "saved",
    createCanvas: () => canvas,
    download: (blob, name) => downloads.push({ size: blob.size, name }),
    now: () => new Date("2026-09-30T12:34:56Z"),
  });
  return { ui, toasts, downloads, drawn, canvas, frame, click: () => click?.() };
}

describe("createScreenshotUi (#364)", () => {
  it("снимает кадр нужного размера и отдаёт PNG с именем канала", () => {
    const h = harness();
    h.ui.take();
    expect(h.canvas.width).toBe(160);
    expect(h.canvas.height).toBe(90);
    expect(h.drawn).toEqual([h.frame]);
    expect(h.downloads).toEqual([{ size: 4, name: "Кино-HD-2026-09-30-12-34-56.png" }]);
    expect(h.toasts).toEqual(["saved"]);
  });

  it("кнопка вызывает тот же снимок", () => {
    const h = harness();
    h.click();
    expect(h.downloads).toHaveLength(1);
  });

  it("без канала ничего не делает, без кадра — подсказка подождать", () => {
    const none = harness({ channel: null });
    none.ui.take();
    expect(none.toasts).toEqual([]);
    const empty = harness({ width: 0 });
    empty.ui.take();
    expect(empty.toasts).toEqual([describeShotFailure("empty")]);
    expect(empty.downloads).toEqual([]);
  });

  it("tainted-канвас: и null, и синхронный SecurityError дают понятный тост", () => {
    for (const mode of ["null", "throw"] as const) {
      const h = harness({ mode });
      expect(() => h.ui.take()).not.toThrow();
      expect(h.toasts).toEqual([describeShotFailure("tainted")]);
      expect(h.downloads).toEqual([]);
    }
  });
});
