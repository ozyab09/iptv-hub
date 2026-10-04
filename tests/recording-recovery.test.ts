import { describe, expect, it } from "vitest";
import {
  PENDING_RECORDING_KEY,
  clearRecordingPending,
  loadRecordingPending,
  markRecordingPending,
  pickWorkFile,
  recoverPendingRecording,
  type RecoveryDeps,
} from "../src/recording-recovery";
import { RECORDINGS_KEY, loadRecordings } from "../src/recordings";

function memoryKv(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

function memoryFs(files: Record<string, File>) {
  const store = new Map(Object.entries(files));
  return {
    store,
    read: async (name: string) => store.get(name) ?? null,
    write: async (name: string, blob: Blob) => {
      store.set(name, new File([blob], name));
    },
    remove: async (name: string) => {
      store.delete(name);
    },
  };
}

const pending = { channelName: "Первый", channelUrl: "https://x/1.m3u8", programmeTitle: "Новости", startedAt: 1_000_000 };

function deps(kv: Storage, fs: ReturnType<typeof memoryFs>): RecoveryDeps {
  return { kv, fs, listWork: async () => [...fs.store.keys()], now: () => 2_000_000, makeId: () => "abc" };
}

describe("recording-recovery (#309)", () => {
  it("метка сохраняется, читается и снимается", () => {
    const kv = memoryKv();
    markRecordingPending(kv, pending);
    expect(loadRecordingPending(kv)).toEqual(pending);
    clearRecordingPending(kv);
    expect(loadRecordingPending(kv)).toBeNull();
  });

  it("битая метка игнорируется", () => {
    const kv = memoryKv();
    kv.setItem(PENDING_RECORDING_KEY, "{oops");
    expect(loadRecordingPending(kv)).toBeNull();
    kv.setItem(PENDING_RECORDING_KEY, JSON.stringify({ channelName: 1, startedAt: 2 }));
    expect(loadRecordingPending(kv)).toBeNull();
  });

  it("выбирает самый свежий rec-*.part не старше метки", () => {
    const names = ["rec-900000.part", "rec-1000100.part", "rec-1000200.part", "schedule-rec-1000300.part", "done-x.ts"];
    expect(pickWorkFile(names, 1_000_000)).toBe("rec-1000200.part");
    expect(pickWorkFile(["rec-1.part"], 1_000_000)).toBeNull();
  });

  it("без метки ничего не трогает", async () => {
    const kv = memoryKv();
    const fs = memoryFs({ "rec-1000100.part": new File([new Uint8Array([0x47, 1])], "p") });
    expect(await recoverPendingRecording(deps(kv, fs))).toBeNull();
    expect(fs.store.has("rec-1000100.part")).toBe(true);
  });

  it("переносит рабочий файл в библиотеку и снимает метку", async () => {
    const kv = memoryKv();
    markRecordingPending(kv, pending);
    const part = new File([new Uint8Array([0x47, 0, 0, 0])], "rec-1000100.part", { lastModified: 1_060_000 });
    const fs = memoryFs({ "rec-1000100.part": part });
    const meta = await recoverPendingRecording(deps(kv, fs));
    expect(meta).toMatchObject({ id: "abc", channelName: "Первый", programmeTitle: "Новости", ext: "ts", sizeBytes: 4, durationSec: 60 });
    expect(fs.store.has("done-abc.ts")).toBe(true);
    expect(fs.store.has("rec-1000100.part")).toBe(false);
    expect(loadRecordings(kv).map((r) => r.id)).toEqual(["abc"]);
    expect(loadRecordingPending(kv)).toBeNull();
  });

  it("fMP4 получает расширение mp4", async () => {
    const kv = memoryKv();
    markRecordingPending(kv, pending);
    const head = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
    const fs = memoryFs({ "rec-1000100.part": new File([head], "p", { lastModified: 1 }) });
    const meta = await recoverPendingRecording(deps(kv, fs));
    expect(meta?.ext).toBe("mp4");
    // lastModified раньше старта — длительность считается по часам
    expect(meta?.durationSec).toBe(1000);
  });

  it("пустой или отсутствующий файл — метка снимается, библиотека пуста", async () => {
    const kv = memoryKv();
    markRecordingPending(kv, pending);
    const fs = memoryFs({ "rec-1000100.part": new File([], "p") });
    expect(await recoverPendingRecording(deps(kv, fs))).toBeNull();
    expect(loadRecordingPending(kv)).toBeNull();
    expect(kv.getItem(RECORDINGS_KEY)).toBeNull();

    markRecordingPending(kv, pending);
    expect(await recoverPendingRecording(deps(kv, memoryFs({})))).toBeNull();
    expect(loadRecordingPending(kv)).toBeNull();
  });
});
