import { expect, it } from "vitest";
import { dayWindows } from "../src/catchup";
import { formatRange } from "../src/epg";
import { clock } from "../src/scrub";
import { emptyMessage } from "../src/views";
import { createRecordingSession, validateRecOp } from "../src/recorder";
import { createSegmentSession } from "../src/segment-recorder";
import type { Language } from "../src/i18n";

it("formats programme times and day labels using the requested language", () => {
  const start = new Date(2026, 8, 28, 19, 5);
  const stop = new Date(2026, 8, 28, 20, 5);
  for (const language of ["ru", "en"] as const) {
    const fmt = new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" });
    expect(formatRange({ start: start.toISOString(), stop: stop.toISOString(), title: "Data", desc: "" }, language)).toBe(`${fmt.format(start)}–${fmt.format(stop)}`);
    expect(clock(start.getTime(), language)).toBe(new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", hour12: false }).format(start));
    const days = dayWindows(start, language);
    expect(days[0]!.label).toBe(language === "ru" ? "Сегодня" : "Today");
    expect(days[1]!.label).toBe(language === "ru" ? "Вчера" : "Yesterday");
    expect(days[2]!.label).toBe(new Date(days[2]!.startMs).toLocaleDateString(language, { weekday: "short", day: "2-digit", month: "2-digit" }));
  }
});

it("localizes empty lists and recording operation errors", () => {
  expect(emptyMessage("favorites", false, "en")).toContain("No favorites yet");
  expect(emptyMessage("recents", false, "en")).toContain("not watched");
  expect(emptyMessage("recordings", false, "en")).toContain("No recordings yet");
  expect(emptyMessage("channels", true, "en")).toBe("Nothing found");
  expect(validateRecOp("stopping", "start", "en")).toBe("Recording is being saved; please wait");
});

it("reads the current language for recording callbacks without translating error data", async () => {
  let language: Language = "en";
  const notices: string[] = [];
  const recording = createRecordingSession({
    language: () => language,
    createSource: () => { throw new Error("Provider message"); },
    createRecorder: () => { throw new Error("Unused"); },
    onNotify: (message) => notices.push(message), onSave: () => {}, onState: () => {},
  });
  recording.start();
  language = "ru";
  recording.start();
  expect(notices).toEqual(["Could not start recording: Provider message", "Не удалось начать запись: Provider message"]);
  const segments = createSegmentSession({
    language: () => language,
    createSink: () => Promise.reject(new Error("Storage message")),
    onNotify: (message) => notices.push(message), onSave: () => {}, onState: () => {},
  });
  language = "en";
  await segments.start();
  expect(notices.at(-1)).toBe("Could not start recording: Storage message");
  await segments.stop(true);
  expect(notices.at(-1)).toBe("Recording has not started");
});
