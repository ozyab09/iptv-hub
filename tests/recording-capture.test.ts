import { describe, expect, it, vi } from "vitest";
import {
  canvasHasFrames,
  createRecorderAdapter,
  createRecordingCapture,
  type CaptureTimers,
  type RecordingCaptureDeps,
} from "../src/recording-capture";
import { t } from "../src/i18n";

function track(kind: "video" | "audio", readyState = "live") {
  return { kind, readyState, label: kind, stop: vi.fn() } as unknown as MediaStreamTrack;
}

function stream(video: MediaStreamTrack[], audio: MediaStreamTrack[] = []) {
  const tracks = [...video, ...audio];
  return {
    getVideoTracks: () => video,
    getAudioTracks: () => audio,
    getTracks: () => tracks,
    addTrack: (item: MediaStreamTrack) => tracks.push(item),
  } as unknown as MediaStream;
}

function fakeCanvas(brightness: number | "tainted") {
  const canvasStream = stream([track("video")]);
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: vi.fn(),
      getImageData: () => {
        if (brightness === "tainted") throw new DOMException("tainted", "SecurityError");
        return { data: new Uint8ClampedArray(16).fill(brightness) };
      },
    }),
    captureStream: () => canvasStream,
  } as unknown as HTMLCanvasElement;
}

/** Таймеры вручную: rAF не крутится, setTimeout копит отложенные пробы. */
function manualTimers() {
  const pending: (() => void)[] = [];
  const timers: CaptureTimers = {
    raf: () => 1,
    cancelRaf: vi.fn(),
    setTimeout: (fn) => void pending.push(fn),
  };
  return { timers, flush: () => pending.splice(0).forEach((fn) => fn()) };
}

function capture(opts: { video?: Partial<HTMLVideoElement> & { captureStream?: () => MediaStream }; canvas?: HTMLCanvasElement; audio?: boolean } = {}) {
  const onNoFrames = vi.fn();
  const released = vi.fn();
  const manual = manualTimers();
  const deps: RecordingCaptureDeps = {
    video: { videoWidth: 160, videoHeight: 90, ...opts.video } as HTMLVideoElement,
    captureAudioTrack: () => (opts.audio ? { track: track("audio"), release: released } : null),
    language: () => "ru",
    onNoFrames,
    createCanvas: () => opts.canvas ?? fakeCanvas(200),
    timers: manual.timers,
  };
  return { cap: createRecordingCapture(deps), onNoFrames, released, ...manual };
}

describe("createRecordingCapture (#366)", () => {
  it("прямой захват элемента: стрим как есть, подпись по наличию звука", () => {
    const direct = stream([track("video")], [track("audio")]);
    const { cap } = capture({ video: { captureStream: () => direct } });
    expect(cap.createSource().stream).toBe(direct);
    expect(cap.note()).toBe(t("record.withAudio", "ru"));
    cap.resetNote();
    expect(cap.note()).toBe("");
  });

  it("мёртвая дорожка элемента — переход на канвас со звуком через Web Audio", () => {
    const dead = stream([track("video", "ended")]);
    const { cap, released } = capture({ video: { captureStream: () => dead }, audio: true });
    const source = cap.createSource();
    expect(source.stream.getAudioTracks).toBeDefined();
    expect(dead.getTracks()[0]!.stop).toHaveBeenCalled();
    expect(cap.note()).toBe(t("record.fallbackAudio", "ru"));
    source.dispose?.();
    expect(released).toHaveBeenCalled();
  });

  it("стратегии идут по порядку и заканчиваются", () => {
    const { cap } = capture();
    expect(cap.nextStrategy()).toBe("canvas-audio");
    expect(cap.nextStrategy()).toBe("canvas-silent");
    expect(cap.nextStrategy()).toBeNull();
    cap.createSource();
    expect(cap.note()).toBe(t("record.fallbackSilent", "ru"));
  });

  it("две чёрные пробы канваса подряд останавливают запись (#58/#60)", () => {
    const { cap, onNoFrames, flush } = capture({ canvas: fakeCanvas(0) });
    cap.createSource();
    flush(); // первая проба — ещё не отказ
    expect(onNoFrames).not.toHaveBeenCalled();
    flush();
    expect(onNoFrames).toHaveBeenCalledTimes(1);
  });

  it("кадры есть или канвас нечитаем — запись продолжается; dispose гасит пробы", () => {
    for (const brightness of [200, "tainted"] as const) {
      const { cap, onNoFrames, flush } = capture({ canvas: fakeCanvas(brightness) });
      cap.createSource();
      flush();
      flush();
      expect(onNoFrames).not.toHaveBeenCalled();
    }
    const black = capture({ canvas: fakeCanvas(0) });
    black.cap.createSource().dispose?.();
    black.flush();
    black.flush();
    expect(black.onNoFrames).not.toHaveBeenCalled();
  });
});

describe("canvasHasFrames", () => {
  it("непустые пиксели — true, чёрные — false, CORS — null", () => {
    const size = { width: 160, height: 90 };
    expect(canvasHasFrames(size, { getImageData: () => ({ data: new Uint8ClampedArray(8).fill(3) }) } as never)).toBe(true);
    expect(canvasHasFrames(size, { getImageData: () => ({ data: new Uint8ClampedArray(8) }) } as never)).toBe(false);
    expect(canvasHasFrames(size, { getImageData: () => { throw new Error("tainted"); } } as never)).toBeNull();
  });
});

describe("createRecorderAdapter", () => {
  it("пробрасывает состояние, чанки, остановку и ошибку", () => {
    let created: FakeRecorder | null = null;
    class FakeRecorder {
      state = "inactive";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      constructor(public stream: MediaStream, public options: { mimeType: string }) {
        created = this;
      }
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.onstop?.(); }
    }
    const adapter = createRecorderAdapter(stream([]), "video/webm", FakeRecorder as unknown as typeof MediaRecorder);
    const chunks: number[] = [];
    let stopped = false;
    let error: Error | undefined;
    adapter.ondataavailable = (e) => chunks.push(e.data.size);
    adapter.onstop = () => { stopped = true; };
    adapter.onerror = (e) => { error = e as Error | undefined; };
    adapter.start(1000);
    expect(adapter.getState()).toBe("recording");
    created!.ondataavailable?.({ data: new Blob([new Uint8Array(5)]) });
    expect(chunks).toEqual([5]);
    const failure = new Error("encoder");
    created!.onerror?.({ error: failure });
    expect(error).toBe(failure);
    adapter.stop();
    expect(stopped).toBe(true);
    expect(adapter.getState()).toBe("inactive");
  });
});
