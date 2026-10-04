import Hls from "hls.js";
import { startBackgroundRecorder } from "./background-recorder";
import type { RecordingRule, Occurrence, ScheduledJob } from "./recording-schedule";
import type { RecordingsFs } from "./recordings-store";

/** Отдельный muted-плеер: расписание не меняет основной канал и ручную запись (движок — background-recorder.ts). */
export async function startScheduledRecorder(rule: RecordingRule, occurrence: Occurrence, fs: RecordingsFs, notify: (message: string) => void, onSaved: () => void, cancelled: () => boolean): Promise<ScheduledJob> {
  if (!Hls.isSupported()) throw new Error("HLS segments unavailable");
  const recorder = await startBackgroundRecorder({
    kind: "schedule",
    videoClass: "scheduled-recording-video",
    url: rule.channelUrl,
    fs,
    channelName: rule.channelName,
    channelUrl: rule.channelUrl,
    programmeTitle: rule.title,
    endAt: occurrence.stop,
    notify,
    onSaved,
    saveFailedMessage: `Не удалось сохранить запись: ${rule.title}`,
  });
  notify(`Запись по расписанию началась: ${rule.title}`);
  return {
    failed: () => recorder.failed() || cancelled(),
    async stop() {
      const saved = await recorder.stop(true);
      notify(saved ? `Запись по расписанию сохранена: ${rule.title}` : `Запись не получена: ${rule.title}`);
      return saved;
    },
  };
}
