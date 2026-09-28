import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createRecordingSession,
  pickRecorderMime,
  recordingFileName,
  validateRecOp,
  type RecorderLike,
  type RecordingDeps,
} from "../src/recorder";

describe("recordingFileName", () => {
  it("builds Channel_YYYY-MM-DD_HH-MM.webm", () => {
    const at = new Date(2026, 8, 28, 15, 7); // локальное время
    expect(recordingFileName("CNN HD", at)).toBe("CNN_HD_2026-09-28_15-07.webm");
  });
  it("sanitizes filesystem-unsafe characters", () => {
    const at = new Date(2026, 0, 2, 3, 4);
    expect(recordingFileName('Кино/ТВ: "4K"', at)).toBe(
      "Кино_ТВ_4K_2026-01-02_03-04.webm",
    );
  });
  it("falls back to 'recording' for an empty name", () => {
    expect(recordingFileName("", new Date(2026, 0, 1))).toBe(
      "recording_2026-01-01_00-00.webm",
    );
  });
});

describe("validateRecOp", () => {
  it("rejects double start", () => {
    expect(validateRecOp("recording", "start")).toBe("Запись уже идёт");
  });
  it("rejects stop when idle", () => {
    expect(validateRecOp("idle", "stop")).toBe("Запись не запущена");
  });
  it("allows valid transitions", () => {
    expect(validateRecOp("idle", "start")).toBeNull();
    expect(validateRecOp("recording", "stop")).toBeNull();
  });
  it("блокирует обе операции, пока запись сохраняется", () => {
    expect(validateRecOp("stopping", "start")).toBe("Запись сохраняется, подождите");
    expect(validateRecOp("stopping", "stop")).toBe("Запись сохраняется, подождите");
  });
});

/** Подменить глобальный MediaRecorder на заглушку с заданным списком mime. */
function withMediaRecorder(supported: string[], fn: () => void): void {
  const g = globalThis as { MediaRecorder?: unknown };
  const prev = g.MediaRecorder;
  g.MediaRecorder = { isTypeSupported: (m: string) => supported.includes(m) };
  try {
    fn();
  } finally {
    g.MediaRecorder = prev;
  }
}

describe("pickRecorderMime", () => {
  it("returns a string or null without throwing in node", () => {
    // в node MediaRecorder нет — должен вернуть null, а не упасть
    expect([null, expect.any(String)]).toContainEqual(pickRecorderMime(false));
  });

  it("не предлагает opus, когда аудиодорожки нет (Firefox иначе зависает, #58)", () => {
    withMediaRecorder(
      ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"],
      () => {
        expect(pickRecorderMime(false)).toBe("video/webm;codecs=vp8");
      },
    );
  });

  it("предпочитает opus, когда аудиодорожка есть", () => {
    withMediaRecorder(
      ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"],
      () => {
        expect(pickRecorderMime(true)).toBe("video/webm;codecs=vp8,opus");
      },
    );
  });
});

// ---- Жизненный цикл записи ----

/** Фейковый рекордер: события дёргаются тестом вручную. */
class FakeRecorder implements RecorderLike {
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  stopCalls = 0;

  getState(): string {
    return this.state;
  }
  start(): void {
    this.state = "recording";
  }
  stop(): void {
    this.stopCalls++;
    this.state = "inactive";
  }
  /** Эмулировать пришедший чанк. */
  emitChunk(text: string): void {
    this.ondataavailable?.({ data: new Blob([text]) });
  }
  /** Эмулировать событие stop (в Firefox оно приходит ~через 16 мс после stop()). */
  emitStop(): void {
    this.onstop?.();
  }
}

interface Harness {
  deps: RecordingDeps;
  recorder: FakeRecorder;
  /** Сколько треков источника остановлено. */
  stoppedTracks: () => number;
  disposed: () => number;
  saves: Array<{ size: number; chunks: number }>;
  notices: string[];
  mimes: string[];
}

function harness(hasAudio = false): Harness {
  const recorder = new FakeRecorder();
  let stopped = 0;
  let disposed = 0;
  const saves: Array<{ size: number; chunks: number }> = [];
  const notices: string[] = [];
  const mimes: string[] = [];

  const track = (kind: string): { kind: string; stop: () => void } => ({
    kind,
    stop: () => {
      stopped++;
    },
  });
  const tracks = hasAudio ? [track("video"), track("audio")] : [track("video")];
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;

  return {
    recorder,
    stoppedTracks: () => stopped,
    disposed: () => disposed,
    saves,
    notices,
    mimes,
    deps: {
      createSource: () => ({
        stream,
        dispose: () => {
          disposed++;
        },
      }),
      createRecorder: (_s, mimeType) => {
        mimes.push(mimeType);
        return recorder;
      },
      onSave: (blob, chunkCount) => saves.push({ size: blob.size, chunks: chunkCount }),
      onNotify: (m) => notices.push(m),
      onState: () => undefined,
      pickMime: (audio) => (audio ? "video/webm;codecs=vp8,opus" : "video/webm;codecs=vp8"),
      stopTimeoutMs: 3000,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createRecordingSession", () => {
  it("выбирает mime по фактическим дорожкам стрима", () => {
    const silent = harness(false);
    createRecordingSession(silent.deps).start();
    expect(silent.mimes).toEqual(["video/webm;codecs=vp8"]);

    const voiced = harness(true);
    createRecordingSession(voiced.deps).start();
    expect(voiced.mimes).toEqual(["video/webm;codecs=vp8,opus"]);
  });

  it("не трогает источник до события stop (корень #58)", () => {
    const h = harness();
    const s = createRecordingSession(h.deps);
    s.start();
    h.recorder.emitChunk("data");
    s.stop(true);

    // stop() вызван, но треки живы и rAF-цикл крутится — иначе Gecko
    // не успевает дослать последний чанк и событие stop.
    expect(h.recorder.stopCalls).toBe(1);
    expect(h.stoppedTracks()).toBe(0);
    expect(h.disposed()).toBe(0);
    expect(s.state()).toBe("stopping");
    expect(h.saves).toHaveLength(0);

    h.recorder.emitStop();
    expect(h.saves).toEqual([{ size: 4, chunks: 1 }]);
    expect(h.stoppedTracks()).toBe(1);
    expect(h.disposed()).toBe(1);
    expect(s.state()).toBe("idle");
  });

  it("сохраняет накопленное, если событие stop не пришло", () => {
    vi.useFakeTimers();
    const h = harness();
    const s = createRecordingSession(h.deps);
    s.start();
    h.recorder.emitChunk("chunk");
    s.stop(true);

    expect(h.saves).toHaveLength(0);
    vi.advanceTimersByTime(3000);

    expect(h.saves).toEqual([{ size: 5, chunks: 1 }]);
    expect(s.state()).toBe("idle");
    expect(h.stoppedTracks()).toBe(1);
  });

  it("не отдаёт файл дважды, когда stop приходит после watchdog", () => {
    vi.useFakeTimers();
    const h = harness();
    const s = createRecordingSession(h.deps);
    s.start();
    h.recorder.emitChunk("chunk");
    s.stop(true);
    vi.advanceTimersByTime(3000);
    h.recorder.emitStop();

    expect(h.saves).toHaveLength(1);
  });

  it("не запускает watchdog, когда stop пришёл вовремя", () => {
    vi.useFakeTimers();
    const h = harness();
    const s = createRecordingSession(h.deps);
    s.start();
    h.recorder.emitChunk("chunk");
    s.stop(true);
    h.recorder.emitStop();
    vi.advanceTimersByTime(10_000);

    expect(h.saves).toHaveLength(1);
    expect(h.stoppedTracks()).toBe(1);
  });

  it("stop(false) освобождает ресурсы, но файл не отдаёт", () => {
    const h = harness();
    const s = createRecordingSession(h.deps);
    s.start();
    h.recorder.emitChunk("data");
    s.stop(false);
    h.recorder.emitStop();

    expect(h.saves).toHaveLength(0);
    expect(h.stoppedTracks()).toBe(1);
    expect(s.state()).toBe("idle");
  });

  it("отклоняет повторный стоп, пока запись сохраняется", () => {
    const h = harness();
    const s = createRecordingSession(h.deps);
    s.start();
    s.stop(true);
    s.stop(true);

    expect(h.recorder.stopCalls).toBe(1);
    expect(h.notices).toContain("Запись сохраняется, подождите");
  });

  it("освобождает источник, если рекордер не создался", () => {
    const h = harness();
    const s = createRecordingSession({
      ...h.deps,
      createRecorder: () => {
        throw new Error("MediaRecorder недоступен");
      },
    });
    s.start();

    expect(s.state()).toBe("idle");
    expect(h.stoppedTracks()).toBe(1);
    expect(h.disposed()).toBe(1);
    expect(h.notices).toContain("Не удалось начать запись: MediaRecorder недоступен");
  });

  it("сообщает о пустой записи, а не молчит", () => {
    const h = harness();
    const s = createRecordingSession(h.deps);
    s.start();
    s.stop(true);
    h.recorder.emitStop();

    expect(h.saves).toEqual([{ size: 0, chunks: 0 }]);
  });
});
