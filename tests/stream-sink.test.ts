import { describe, expect, it } from "vitest";
import { pipeStreamToSink } from "../src/stream-sink";

function streamOf(chunks: number[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      const size = chunks[i++];
      if (size === undefined) controller.close();
      else controller.enqueue(new Uint8Array(size).fill(i));
    },
  });
}

// #359: прямое скачивание передачи пишет чанки в OPFS по мере прихода.
describe("pipeStreamToSink", () => {
  it("каждый чанк уходит в приёмник сразу, прогресс растёт", async () => {
    const written: number[] = [];
    const progress: number[] = [];
    const sink = { write: (chunk: ArrayBuffer) => void written.push(chunk.byteLength), error: () => null };
    const total = await pipeStreamToSink(streamOf([1000, 2000, 500]), sink, (b) => progress.push(b));
    expect(total).toBe(3500);
    expect(written).toEqual([1000, 2000, 500]);
    expect(progress).toEqual([1000, 3000, 3500]);
  });

  it("ошибка приёмника прерывает чтение", async () => {
    let calls = 0;
    const sink = { write: () => void calls++, error: () => (calls >= 2 ? new Error("квота") : null) };
    await expect(pipeStreamToSink(streamOf([10, 10, 10, 10]), sink)).rejects.toThrow("квота");
    expect(calls).toBe(2);
  });

  it("отмена через signal останавливает чтение", async () => {
    const controller = new AbortController();
    let calls = 0;
    const sink = {
      write: () => {
        calls++;
        if (calls === 1) controller.abort();
      },
      error: () => null,
    };
    await expect(pipeStreamToSink(streamOf([10, 10, 10]), sink, undefined, controller.signal)).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
