import Hls from "hls.js";
import { Player } from "./player";
import { createSegmentSession } from "./segment-recorder";
import { createRecordingSink } from "./recording-sink";
import type { RecordingRule, Occurrence, ScheduledJob } from "./recording-schedule";
import { addRecording } from "./recordings";
import { recordingFileName as storedRecordingName, type RecordingsFs } from "./recordings-store";

/** Отдельный muted-плеер: расписание не меняет основной канал и ручную запись. */
export async function startScheduledRecorder(rule: RecordingRule, occurrence: Occurrence, fs: RecordingsFs, notify: (message: string) => void, onSaved: () => void, cancelled: () => boolean): Promise<ScheduledJob> {
  if (!Hls.isSupported()) throw new Error("HLS segments unavailable");
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.hidden = true;
  video.className = "scheduled-recording-video";
  document.body.append(video);
  let failed = false;
  let stopping = false;
  let saved = false;
  let saving: Promise<void> = Promise.resolve();
  const startedAt = Date.now();
  const player = new Player(video, notify, undefined, () => { failed = true; });
  const session = createSegmentSession({
    createSink: () => createRecordingSink("schedule-rec-"),
    onNotify: notify,
    onState: (state) => { if (state === "idle" && !stopping) failed = true; },
    onSave: (blob, result) => {
      saving = (async () => {
        const id = crypto.randomUUID();
        await fs.write(storedRecordingName(id, result.ext), blob);
        addRecording(localStorage, { id, channelName: rule.channelName, channelUrl: rule.channelUrl, programmeTitle: rule.title, startedAt,
          durationSec: Math.max(0, (Math.min(Date.now(), occurrence.stop) - startedAt) / 1000), sizeBytes: blob.size, ext: result.ext });
        saved = true;
        onSaved();
      })().catch(() => { failed = true; notify(`Не удалось сохранить запись: ${rule.title}`); });
    },
  });
  await session.start();
  if (!session.isRecording()) { video.remove(); throw new Error("Recording sink unavailable"); }
  player.setFragmentListener((payload, init) => session.feed(payload, init));
  const refused = player.play({ url: rule.channelUrl }, true);
  if (refused) { await session.stop(false); player.stop(); video.remove(); throw new Error(refused); }
  notify(`Запись по расписанию началась: ${rule.title}`);
  return {
    failed: () => failed || cancelled(),
    async stop() {
      stopping = true;
      player.stop();
      video.remove();
      await session.stop(true);
      await saving;
      notify(saved ? `Запись по расписанию сохранена: ${rule.title}` : `Запись не получена: ${rule.title}`);
      return saved;
    },
  };
}
