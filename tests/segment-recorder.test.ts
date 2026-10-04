import { describe, it, expect } from "vitest";
import {
  containerExt,
  createSegmentSession,
  detectContainer,
  type RecordingSink,
  type SegmentRecorderDeps,
  type SegmentResult,
} from "../src/segment-recorder";

/** Сегмент MPEG-TS: начинается с sync-байта 0x47. */
function tsSegment(size = 64): ArrayBuffer {
  const b = new Uint8Array(size);
  b[0] = 0x47;
  return b.buffer;
}

/** Сегмент fMP4: бокс ftyp/moof на смещении 4. */
function mp4Segment(tag: "ftyp" | "moof", size = 64): ArrayBuffer {
  const b = new Uint8Array(size);
  for (let i = 0; i < 4; i++) b[4 + i] = tag.charCodeAt(i);
  return b.buffer;
}

describe("detectContainer", () => {
  it("узнаёт MPEG-TS по sync-байту", () => {
    expect(detectContainer(new Uint8Array(tsSegment()))).toBe("ts");
  });
  it("узнаёт fMP4 по ftyp/styp/moof", () => {
    expect(detectContainer(new Uint8Array(mp4Segment("ftyp")))).toBe("mp4");
    expect(detectContainer(new Uint8Array(mp4Segment("moof")))).toBe("mp4");
  });
  it("не гадает на мусоре и пустоте", () => {
    expect(detectContainer(new Uint8Array(0))).toBe("unknown");
    expect(detectContainer(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe("unknown");
  });
});

describe("containerExt", () => {
  it("mp4 остаётся mp4, остальное пишем как ts", () => {
    expect(containerExt("mp4")).toBe("mp4");
    expect(containerExt("ts")).toBe("ts");
    expect(containerExt("unknown")).toBe("ts");
  });
});

interface Harness {
  deps: SegmentRecorderDeps;
  saves: Array<{ size: number; result: SegmentResult }>;
  notices: string[];
  states: string[];
  written: () => number;
  aborted: () => number;
}

function harness(opts: { failAfter?: number; maxBytes?: number } = {}): Harness {
  const saves: Array<{ size: number; result: SegmentResult }> = [];
  const notices: string[] = [];
  const states: string[] = [];
  let written = 0;
  let aborted = 0;

  const sink: RecordingSink = {
    kind: "fake",
    write(chunk) {
      written += chunk.byteLength;
    },
    size: () => written,
    error: () =>
      opts.failAfter !== undefined && written > opts.failAfter
        ? new Error("кончилось место")
        : null,
    finish: () => Promise.resolve(new Blob([new Uint8Array(written)])),
    abort: () => {
      aborted++;
      return Promise.resolve();
    },
  };

  return {
    saves,
    notices,
    states,
    written: () => written,
    aborted: () => aborted,
    deps: {
      createSink: () => Promise.resolve(sink),
      onSave: (blob, result) => saves.push({ size: blob.size, result }),
      onNotify: (m) => notices.push(m),
      onState: (s) => states.push(s),
      ...(opts.maxBytes === undefined ? {} : { maxBytes: opts.maxBytes }),
    },
  };
}

describe("createSegmentSession", () => {
  it("складывает сегменты и отдаёт .ts", async () => {
    const h = harness();
    const s = createSegmentSession(h.deps);
    await s.start();
    s.feed(tsSegment(100), false);
    s.feed(tsSegment(100), false);
    await s.stop(true);

    expect(h.saves).toHaveLength(1);
    expect(h.saves[0]?.result.segments).toBe(2);
    expect(h.saves[0]?.result.ext).toBe("ts");
    expect(h.written()).toBe(200);
    expect(s.state()).toBe("idle");
  });

  it("до старта сегменты игнорируются", async () => {
    const h = harness();
    const s = createSegmentSession(h.deps);
    s.feed(tsSegment(100), false);
    await s.start();
    s.feed(tsSegment(100), false);
    await s.stop(true);

    expect(h.written()).toBe(100);
    expect(h.saves[0]?.result.segments).toBe(1);
  });

  it("init-сегмент запоминается заранее и ложится в файл первым", async () => {
    const h = harness();
    const s = createSegmentSession(h.deps);
    // init прилетает при запуске канала, задолго до нажатия на запись
    s.feed(mp4Segment("ftyp", 40), true);
    await s.start();
    s.feed(mp4Segment("moof", 100), false);
    await s.stop(true);

    // 40 байт init + 100 байт сегмента
    expect(h.written()).toBe(140);
    expect(h.saves[0]?.result.ext).toBe("mp4");
  });

  it("init прошлого fMP4-потока не попадает в TS-запись после смены потока (#347)", async () => {
    const chunks: Uint8Array[] = [];
    const h = harness();
    const s = createSegmentSession({
      ...h.deps,
      createSink: async () => ({
        kind: "capture",
        write: (chunk) => void chunks.push(new Uint8Array(chunk)),
        size: () => chunks.reduce((n, c) => n + c.byteLength, 0),
        error: () => null,
        finish: async () => new Blob(chunks as BlobPart[]),
        abort: async () => undefined,
      }),
    });
    // канал A — fMP4 с init; затем канал B — обычный TS
    s.feed(mp4Segment("ftyp", 40), true);
    s.resetStream();
    await s.start();
    s.feed(tsSegment(100), false);
    await s.stop(true);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.[0]).toBe(0x47);
    expect(h.saves[0]?.result.ext).toBe("ts");
    expect(h.saves[0]?.size).toBe(100);
  });

  it("init нового fMP4-потока после сброса ложится вместо старого", async () => {
    const h = harness();
    const s = createSegmentSession(h.deps);
    s.feed(mp4Segment("ftyp", 40), true);
    s.resetStream();
    s.feed(mp4Segment("ftyp", 24), true);
    await s.start();
    s.feed(mp4Segment("moof", 100), false);
    await s.stop(true);

    expect(h.written()).toBe(124);
    expect(h.saves[0]?.result.ext).toBe("mp4");
  });

  it("останавливается сам на потолке размера", async () => {
    const h = harness({ maxBytes: 150 });
    const s = createSegmentSession(h.deps);
    await s.start();
    s.feed(tsSegment(100), false);
    expect(s.isRecording()).toBe(true);
    s.feed(tsSegment(100), false);
    await Promise.resolve();
    await Promise.resolve();

    expect(h.notices).toContain("Достигнут предел размера — сохраняю записанное");
  });

  it("сообщает об ошибке хранилища", async () => {
    const h = harness({ failAfter: 50 });
    const s = createSegmentSession(h.deps);
    await s.start();
    s.feed(tsSegment(100), false);

    expect(h.notices.some((n) => n.includes("кончилось место"))).toBe(true);
  });

  it("stop(false) выбрасывает записанное", async () => {
    const h = harness();
    const s = createSegmentSession(h.deps);
    await s.start();
    s.feed(tsSegment(100), false);
    await s.stop(false);

    expect(h.saves).toHaveLength(0);
    expect(h.aborted()).toBe(1);
    expect(s.state()).toBe("idle");
  });

  it("не отдаёт файл, если ни одного сегмента не пришло", async () => {
    const h = harness();
    const s = createSegmentSession(h.deps);
    await s.start();
    await s.stop(true);

    expect(h.saves).toHaveLength(0);
    expect(h.notices).toContain("Записать не успели ни одного сегмента");
  });

  it("отклоняет повторный старт", async () => {
    const h = harness();
    const s = createSegmentSession(h.deps);
    await s.start();
    await s.start();

    expect(h.notices).toContain("Запись уже идёт");
  });
});
