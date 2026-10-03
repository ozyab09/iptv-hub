import { parseChannelOverrides, serializeChannelOverrides, type ChannelOverride } from "./channel-overrides";
import { parseGroupPreferences, serializeGroupPreferences } from "./group-preferences";
import { parseParentalPins, serializeParentalPins, type PinHash } from "./parental-pin";
import { parsePlayerSettings, type PlayerSettings } from "./player-settings";
import { parseInterval, type RefreshInterval } from "./refresh";
import { parseRecordingRules, type RecordingRule } from "./recording-schedule";
import { parsePositions, type PositionMap } from "./positions";
import { parseChannelHealth, serializeChannelHealth, type ChannelFailure } from "./channel-health";
import { parseFavoritesOrder } from "./favorites-order";
import { parseReminders, parseReminderSettings, type ProgrammeReminder } from "./reminder";
import type { Language } from "./i18n";

export interface BackupSections {
  channelOverrides?: Record<string, (ChannelOverride & { url: string })[]>;
  groupPreferences?: Record<string, { hidden: string[]; order: string[] }>;
  parentalPins?: Record<string, (PinHash & { group: string })[]>;
  channelHealth?: Record<string, { version: 1; failures: (ChannelFailure & { url: string })[] }>;
  recordingSchedule?: Record<string, RecordingRule[]>;
  favoritesOrder?: Record<string, string[]>;
  reminders?: Record<string, ProgrammeReminder[]>;
  playerSettings?: PlayerSettings;
  language?: Language;
  refreshInterval?: RefreshInterval;
  positions?: PositionMap;
  reminderSettings?: { minutes: number; desktop: boolean };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const json = (value: unknown): string => JSON.stringify(value);
// Key ordering does not make an otherwise valid section damaged.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${json(key)}:${canonical(value[key])}`).join(",")}}`;
  return json(value);
}

/** Reuse each owning module's parser; malformed sections do not abort the whole backup. */
export function parseBackupSections(input: Record<string, unknown>, playlistIds: readonly string[]): { sections: BackupSections; warnings: string[] } {
  const sections: BackupSections = {};
  const warnings: string[] = [];
  const ids = new Set(playlistIds);
  function perPlaylist<K extends keyof BackupSections>(name: K, array: boolean, normalize: (value: unknown, id: string) => unknown): void {
    const raw = input[name];
    if (raw === undefined) return;
    if (!object(raw)) { warnings.push(name); return; }
    const entries: [string, unknown][] = [];
    for (const [id, value] of Object.entries(raw)) {
      if (!ids.has(id) || !(array ? Array.isArray(value) : object(value))) { warnings.push(`${name}:${id}`); continue; }
      const clean = normalize(value, id);
      if (clean === undefined) { warnings.push(`${name}:${id}`); continue; }
      if (canonical(value) !== canonical(clean)) warnings.push(`${name}:${id}`);
      entries.push([id, clean]);
    }
    Object.assign(sections, { [name]: Object.fromEntries(entries) });
  }
  perPlaylist("channelOverrides", true, (v) => JSON.parse(serializeChannelOverrides(parseChannelOverrides(json(v)))));
  perPlaylist("groupPreferences", false, (v) => JSON.parse(serializeGroupPreferences(parseGroupPreferences(json(v)))));
  perPlaylist("parentalPins", true, (v) => JSON.parse(serializeParentalPins(parseParentalPins(json(v)))));
  perPlaylist("channelHealth", false, (v) => object(v) && v.version === 1 && Array.isArray(v.failures)
    ? JSON.parse(serializeChannelHealth(parseChannelHealth(json(v)))) : undefined);
  perPlaylist("favoritesOrder", true, (v) => parseFavoritesOrder(json(v)));
  perPlaylist("reminders", true, (v) => parseReminders(json(v)));
  perPlaylist("recordingSchedule", true, (v, id) => parseRecordingRules(json(v)).filter((rule) => rule.playlistId === id).map((rule) =>
    rule.status === "recording" ? { ...rule, status: "missed", lastStart: rule.lastStart ?? rule.start } : rule));
  function global<K extends keyof BackupSections>(name: K, valid: boolean, normalize: () => unknown): void {
    if (input[name] === undefined) return;
    if (!valid) { warnings.push(name); return; }
    const clean = normalize();
    if (canonical(input[name]) !== canonical(clean)) warnings.push(name);
    Object.assign(sections, { [name]: clean });
  }
  global("playerSettings", object(input.playerSettings), () => parsePlayerSettings(json(input.playerSettings)));
  global("language", input.language === "ru" || input.language === "en", () => input.language);
  global("refreshInterval", typeof input.refreshInterval === "number" && [0, 60, 360, 1440].includes(input.refreshInterval), () => parseInterval(String(input.refreshInterval)));
  global("positions", object(input.positions), () => parsePositions(json(input.positions)));
  global("reminderSettings", object(input.reminderSettings), () => parseReminderSettings(json(input.reminderSettings)));
  return { sections, warnings };
}
