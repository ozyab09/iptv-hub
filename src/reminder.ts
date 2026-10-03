/** Programme reminders run only while an application tab is open. */
export interface ProgrammeReminder {
  channelUrl: string;
  channelName: string;
  title: string;
  start: number;
  stop: number;
  leadMinutes: number;
  notified: boolean;
}

export const DEFAULT_REMINDER_MINUTES = 5;
export const REMINDER_SETTINGS_KEY = "iptv-hub.reminder-settings.v1";
export function parseReminderSettings(raw: string | null): { minutes: number; desktop: boolean } {
  try {
    const data = JSON.parse(raw ?? "null");
    return { minutes: Number.isInteger(data?.minutes) && data.minutes >= 1 && data.minutes <= 60 ? data.minutes : DEFAULT_REMINDER_MINUTES, desktop: data?.desktop === true };
  } catch { return { minutes: DEFAULT_REMINDER_MINUTES, desktop: false }; }
}
export const remindersKey = (playlistId: string): string => `iptv-hub.reminders.v1:${playlistId}`;
export const reminderId = (reminder: Pick<ProgrammeReminder, "channelUrl" | "start">): string => JSON.stringify([reminder.channelUrl, reminder.start]);

export function parseReminders(raw: string | null): ProgrammeReminder[] {
  const result = new Map<string, ProgrammeReminder>();
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(data)) return [];
    for (const item of data) {
      if (!item || typeof item !== "object" || typeof item.channelUrl !== "string" || !item.channelUrl ||
          typeof item.channelName !== "string" || typeof item.title !== "string" ||
          !Number.isFinite(item.start) || !Number.isFinite(item.stop) || item.stop <= item.start) continue;
      const reminder: ProgrammeReminder = {
        channelUrl: item.channelUrl, channelName: item.channelName, title: item.title,
        start: item.start, stop: item.stop,
        leadMinutes: Number.isInteger(item.leadMinutes) && item.leadMinutes >= 1 && item.leadMinutes <= 60 ? item.leadMinutes : DEFAULT_REMINDER_MINUTES,
        notified: item.notified === true,
      };
      result.set(reminderId(reminder), reminder);
    }
  } catch { /* Corrupt storage contains no usable reminders. */ }
  return [...result.values()];
}

/** A second click removes the same channel/programme; only future starts can be added. */
export function toggleReminder(list: readonly ProgrammeReminder[], reminder: Omit<ProgrammeReminder, "notified">, now: number): ProgrammeReminder[] {
  const id = reminderId(reminder);
  if (list.some((item) => reminderId(item) === id)) return list.filter((item) => reminderId(item) !== id);
  return reminder.start > now ? [...list, { ...reminder, notified: false }] : [...list];
}

export function createReminderScheduler(deps: {
  now: () => number;
  read: () => ProgrammeReminder[];
  write: (reminders: ProgrammeReminder[]) => void;
  notify: (reminder: ProgrammeReminder) => void;
}) {
  return {
    tick(): void {
      const now = deps.now();
      const list = deps.read();
      const future = list.filter((item) => item.start > now);
      const due = future.filter((item) => !item.notified && now >= item.start - item.leadMinutes * 60_000);
      if (future.length === list.length && !due.length) return;
      const ids = new Set(due.map(reminderId));
      // Persist delivery before invoking the notification callback or another tick.
      deps.write(future.map((item) => ids.has(reminderId(item)) ? { ...item, notified: true } : item));
      due.forEach(deps.notify);
    },
  };
}
