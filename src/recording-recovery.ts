/**
 * Восстановление ручной записи после внезапной выгрузки вкладки (#309).
 *
 * На старте записи в localStorage кладётся метка с подписью (канал,
 * передача, время). Успешное сохранение в библиотеку её снимает. Если
 * вкладку закрыли/убили раньше, на следующем запуске метка ещё лежит, а в
 * OPFS — рабочий `rec-<ts>.part`: его содержимое переносится в библиотеку
 * обычной записью. Продолжить запись после выгрузки нельзя — без вкладки
 * никто не качает сегменты, а внешние «сервисы сессий» противоречат
 * zero-backend и privacy-first.
 */
import { addRecording, type RecordingMeta, type RecordingsKV } from "./recordings";
import { recordingFileName, type RecordingsFs } from "./recordings-store";
import { containerExt, detectContainer } from "./segment-recorder";

export const PENDING_RECORDING_KEY = "iptv-hub.recording-pending.v1";

/** Подпись незавершённой записи. */
export interface PendingRecording {
  channelName: string;
  channelUrl: string;
  programmeTitle: string | null;
  startedAt: number;
}

export function markRecordingPending(kv: RecordingsKV, pending: PendingRecording): void {
  try {
    kv?.setItem(PENDING_RECORDING_KEY, JSON.stringify(pending));
  } catch {
    /* приватный режим — восстановления просто не будет */
  }
}

export function clearRecordingPending(kv: (RecordingsKV & Pick<Storage, "removeItem">) | null): void {
  try {
    kv?.removeItem(PENDING_RECORDING_KEY);
  } catch {
    /* приватный режим */
  }
}

export function loadRecordingPending(kv: RecordingsKV): PendingRecording | null {
  try {
    const raw = kv?.getItem(PENDING_RECORDING_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Record<string, unknown>;
    if (typeof r.channelName !== "string" || typeof r.startedAt !== "number" || !Number.isFinite(r.startedAt)) {
      return null;
    }
    return {
      channelName: r.channelName,
      channelUrl: typeof r.channelUrl === "string" ? r.channelUrl : "",
      programmeTitle: typeof r.programmeTitle === "string" ? r.programmeTitle : null,
      startedAt: r.startedAt,
    };
  } catch {
    return null;
  }
}

const WORK_FILE = /^rec-(\d+)\.part$/;
/** Хранилище создаётся чуть позже метки; запас на часы и порядок вызовов. */
const START_SLACK_MS = 5000;

/** Рабочий файл этой записи: самый свежий `rec-<ts>.part`, начатый не раньше метки. */
export function pickWorkFile(names: readonly string[], startedAt: number): string | null {
  let best: string | null = null;
  let bestTs = -Infinity;
  for (const name of names) {
    const m = WORK_FILE.exec(name);
    if (!m) continue;
    const ts = Number(m[1]);
    if (ts < startedAt - START_SLACK_MS || ts <= bestTs) continue;
    best = name;
    bestTs = ts;
  }
  return best;
}

export interface RecoveryDeps {
  kv: (RecordingsKV & Pick<Storage, "removeItem">) | null;
  fs: Pick<RecordingsFs, "read" | "write" | "remove">;
  /** Имена рабочих файлов в OPFS (`rec-*`). */
  listWork: () => Promise<string[]>;
  now: () => number;
  makeId: () => string;
}

/**
 * Перенести брошенную запись в библиотеку. Возвращает метаданные
 * восстановленной записи или null, если восстанавливать нечего.
 * Метка снимается в любом исходе, кроме ошибки хранилища.
 */
export async function recoverPendingRecording(deps: RecoveryDeps): Promise<RecordingMeta | null> {
  const pending = loadRecordingPending(deps.kv);
  if (!pending) return null;
  const name = pickWorkFile(await deps.listWork(), pending.startedAt);
  const file = name ? await deps.fs.read(name) : null;
  if (!name || !file || file.size === 0) {
    clearRecordingPending(deps.kv);
    return null;
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ext = containerExt(detectContainer(head));
  const endedAt = file.lastModified > pending.startedAt ? file.lastModified : deps.now();
  const id = deps.makeId();
  const meta: RecordingMeta = {
    id,
    channelName: pending.channelName,
    channelUrl: pending.channelUrl,
    programmeTitle: pending.programmeTitle,
    startedAt: pending.startedAt,
    durationSec: Math.max(0, (endedAt - pending.startedAt) / 1000),
    sizeBytes: file.size,
    ext,
  };
  await deps.fs.write(recordingFileName(id, ext), file);
  addRecording(deps.kv, meta);
  clearRecordingPending(deps.kv);
  await deps.fs.remove(name);
  return meta;
}
