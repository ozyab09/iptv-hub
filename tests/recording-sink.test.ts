import { afterEach, expect, it, vi } from "vitest";
import { createRecordingSink } from "../src/recording-sink";
afterEach(() => vi.unstubAllGlobals());

it("keeps manual and scheduled working files in separate namespaces", async () => {
  const files = new Map<string, Blob>([["rec-manual.part", new Blob(["manual"])], ["schedule-rec-old.part", new Blob(["old"])]]);
  const dir = {
    async *keys() { yield* files.keys(); },
    removeEntry: async (name: string) => { files.delete(name); },
    getFileHandle: async (name: string) => ({
      getFile: async () => files.get(name)!,
      createWritable: async () => {
        const chunks: ArrayBuffer[] = [];
        return { write: async (chunk: ArrayBuffer) => { chunks.push(chunk); }, close: async () => { files.set(name, new Blob(chunks)); } };
      },
    }),
  };
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => dir } });
  const sink = await createRecordingSink("schedule-rec-");
  sink.write(new Uint8Array([1, 2, 3]).buffer);
  expect((await sink.finish()).size).toBe(3);
  expect(files.has("rec-manual.part")).toBe(true);
  expect(files.has("schedule-rec-old.part")).toBe(false);
});
