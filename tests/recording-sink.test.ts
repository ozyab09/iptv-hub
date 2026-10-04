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

// #377: у каждой фоновой записи свой префикс; сборка мусора одного пути
// не трогает рабочие файлы других (ручная, расписание, скачивание).
it("manual, scheduled and download working files never sweep each other", async () => {
  const { BACKGROUND_PREFIXES } = await import("../src/background-recorder");
  expect(BACKGROUND_PREFIXES).toEqual({ schedule: "schedule-rec-", download: "download-rec-" });
  for (const prefix of ["rec-", BACKGROUND_PREFIXES.schedule, BACKGROUND_PREFIXES.download]) {
    const files = new Map<string, Blob>([
      ["rec-1.part", new Blob(["m"])],
      ["schedule-rec-1.part", new Blob(["s"])],
      ["download-rec-1.part", new Blob(["d"])],
    ]);
    const dir = {
      async *keys() { yield* [...files.keys()]; },
      removeEntry: async (name: string) => { files.delete(name); },
      getFileHandle: async (name: string) => ({
        getFile: async () => files.get(name)!,
        createWritable: async () => ({ write: async () => undefined, close: async () => { files.set(name, new Blob([])); } }),
      }),
    };
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => dir } });
    await createRecordingSink(prefix);
    const survivors = ["rec-1.part", "schedule-rec-1.part", "download-rec-1.part"].filter((name) => files.has(name));
    expect(survivors).toEqual(["rec-1.part", "schedule-rec-1.part", "download-rec-1.part"].filter((name) => !name.startsWith(prefix)));
  }
});
