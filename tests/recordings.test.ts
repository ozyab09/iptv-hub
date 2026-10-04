import { describe, expect, it } from "vitest";
import {
  addRecording,
  findRecording,
  formatBytes,
  formatDuration,
  loadRecordings,
  RECORDINGS_MAX,
  removeRecording,
  type RecordingMeta,
} from "../src/recordings";
import { memoryStorage as kv } from "./fakes/storage";


const meta = (id: string, startedAt: number): RecordingMeta => ({
  id,
  channelName: "Канал",
  channelUrl: "https://a/stream",
  programmeTitle: null,
  startedAt,
  durationSec: 60,
  sizeBytes: 1024 * 1024,
  ext: "ts",
});

describe("recordings library", () => {
  it("add → load: свежие сверху", () => {
    const s = kv();
    addRecording(s, meta("a", 100));
    addRecording(s, meta("b", 200));
    expect(loadRecordings(s).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("add с тем же id заменяет запись", () => {
    const s = kv();
    addRecording(s, meta("a", 100));
    addRecording(s, { ...meta("a", 100), durationSec: 90 });
    expect(loadRecordings(s)).toHaveLength(1);
    expect(loadRecordings(s)[0]!.durationSec).toBe(90);
  });

  it("вытеснение старых за лимитом", () => {
    const s = kv();
    for (let i = 0; i < RECORDINGS_MAX + 5; i++) {
      addRecording(s, meta(`r${i}`, i));
    }
    const list = loadRecordings(s);
    expect(list).toHaveLength(RECORDINGS_MAX);
    expect(list[0]!.id).toBe(`r${RECORDINGS_MAX + 4}`);
  });

  it("remove удаляет по id", () => {
    const s = kv();
    addRecording(s, meta("a", 1));
    addRecording(s, meta("b", 2));
    removeRecording(s, "a");
    expect(loadRecordings(s).map((r) => r.id)).toEqual(["b"]);
  });

  it("find возвращает запись или null", () => {
    const s = kv();
    addRecording(s, meta("a", 1));
    expect(findRecording(s, "a")?.channelName).toBe("Канал");
    expect(findRecording(s, "nope")).toBeNull();
  });

  it("битый JSON трактуется как пусто; null storage — no-op", () => {
    const s = kv();
    s!.setItem("iptv-hub.recordings.v1", "{oops");
    expect(loadRecordings(s)).toEqual([]);
    expect(loadRecordings(null)).toEqual([]);
    addRecording(null, meta("a", 1)); // не падает
  });

  it("sanitize отбрасывает мусорные элементы", () => {
    const s = kv();
    s!.setItem(
      "iptv-hub.recordings.v1",
      JSON.stringify([{ id: "ok", channelName: "C", startedAt: 1, durationSec: 1, sizeBytes: 1 }, "junk", null, { id: 5 }]),
    );
    expect(loadRecordings(s)).toHaveLength(1);
  });

  it("formatBytes: Б/КБ/МБ/ГБ", () => {
    expect(formatBytes(500)).toBe("500 Б");
    expect(formatBytes(2048)).toBe("2 КБ");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 МБ");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.50 ГБ");
  });

  it("formatDuration: M:SS и H:MM:SS", () => {
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(61)).toBe("1:01");
    expect(formatDuration(3700)).toBe("1:01:40");
  });
});
