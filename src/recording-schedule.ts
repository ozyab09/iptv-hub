export type Repeat = "once" | "daily" | "weekdays";
export interface RecordingRule {
  id: string; playlistId: string; channelUrl: string; channelName: string; group: string;
  title: string; start: number; stop: number; repeat: Repeat; revision: number;
  lastStart: number | null; status: "scheduled" | "recording" | "done" | "failed" | "missed";
}
export interface Occurrence { start: number; stop: number }
export const SCHEDULE_KEY = "iptv-hub.recording-schedule.v1";

export function parseRecordingRules(raw: string | null): RecordingRule[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is RecordingRule => {
      if (!r || typeof r !== "object") return false;
      const v = r as Record<string, unknown>;
      return ["id", "playlistId", "channelUrl", "channelName", "group", "title"].every((k) => typeof v[k] === "string")
        && /^https?:\/\//i.test(String(v.channelUrl))
        && typeof v.start === "number" && Number.isFinite(v.start)
        && typeof v.stop === "number" && Number.isFinite(v.stop) && v.stop > v.start
        && typeof v.revision === "number" && Number.isFinite(v.revision)
        && ["once", "daily", "weekdays"].includes(String(v.repeat))
        && (v.lastStart === null || typeof v.lastStart === "number" && Number.isFinite(v.lastStart))
        && ["scheduled", "recording", "done", "failed", "missed"].includes(String(v.status));
    });
  } catch { return []; }
}

/** Повторы идут по местному времени слота, не по названию передачи в EPG. */
export function nextOccurrence(rule: RecordingRule, now: number): Occurrence | null {
  if (rule.repeat === "once") return now < rule.stop ? { start: rule.start, stop: rule.stop } : null;
  const original = new Date(rule.start);
  const day = new Date(Math.max(now, rule.start));
  day.setHours(original.getHours(), original.getMinutes(), original.getSeconds(), original.getMilliseconds());
  day.setDate(day.getDate() - 1);
  for (let i = 0; i < 8; i++) {
    const start = day.getTime();
    const stop = start + rule.stop - rule.start;
    if (start >= rule.start && stop > now && (rule.repeat !== "weekdays" || day.getDay() !== 0 && day.getDay() !== 6)) return { start, stop };
    day.setDate(day.getDate() + 1);
  }
  return null;
}

export interface ScheduledJob { stop(): Promise<boolean>; failed(): boolean }
export interface SchedulerDeps {
  now(): number;
  read(): RecordingRule[];
  write(rules: RecordingRule[]): void;
  start(rule: RecordingRule, occurrence: Occurrence): Promise<ScheduledJob>;
  notify(message: string): void;
}

/** Чистый планировщик: часы, хранилище и исполнитель передаются извне. */
export function createRecordingScheduler(deps: SchedulerDeps) {
  let active: { rule: RecordingRule; occurrence: Occurrence; job: ScheduledJob } | null = null;
  let busy = false;
  let disposed = false;
  const update = (id: string, patch: Partial<RecordingRule>) => deps.write(deps.read().map((r) => r.id === id ? { ...r, ...patch } : r));
  async function finish() {
    const previous = active;
    if (!previous) return;
    active = null;
    const saved = await previous.job.stop();
    deps.write(deps.read().map((r) => r.id === previous.rule.id && r.revision === previous.rule.revision
      ? { ...r, status: saved && !previous.job.failed() ? "done" : "failed" } : r));
  }
  return {
    async tick(): Promise<void> {
      if (busy || disposed) return;
      busy = true;
      try {
        const now = deps.now();
        const rules = deps.read();
        if (active && (now >= active.occurrence.stop || active.job.failed() || !rules.some((r) => r.id === active!.rule.id && r.revision === active!.rule.revision))) await finish();
        const due = rules.map((rule) => ({ rule, occurrence: nextOccurrence(rule, now) }))
          .filter((item): item is { rule: RecordingRule; occurrence: Occurrence } => item.occurrence !== null && item.occurrence.start <= now && item.rule.lastStart !== item.occurrence.start)
          .sort((a, b) => a.occurrence.start - b.occurrence.start || a.rule.id.localeCompare(b.rule.id));
        for (const { rule, occurrence } of due) {
          update(rule.id, { lastStart: occurrence.start, status: active ? "missed" : "recording" });
          if (active) { deps.notify(`Запись пропущена: другой слот уже записывается — ${rule.title}`); continue; }
          try {
            const job = await deps.start(rule, occurrence);
            if (disposed) { await job.stop(); break; }
            active = { rule, occurrence, job };
          } catch {
            update(rule.id, { status: "failed" });
            deps.notify(`Не удалось начать запись: ${rule.title}`);
          }
        }
        for (const rule of deps.read()) if (rule.repeat === "once" && rule.stop <= now && rule.lastStart === null && rule.status !== "missed") update(rule.id, { status: "missed" });
      } finally { busy = false; }
    },
    async dispose(): Promise<void> { disposed = true; await finish(); },
  };
}
