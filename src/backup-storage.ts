import type { Backup, BackupSections } from "./backup";
import { parseBackupSections } from "./backup-sections";
import { channelOverridesKey } from "./channel-overrides";
import { groupPreferencesKey } from "./group-preferences";
import { parentalPinsKey } from "./parental-pin";
import { channelHealthKey } from "./channel-health";
import { favoritesOrderKey } from "./favorites-order";
import { remindersKey, REMINDER_SETTINGS_KEY, parseReminderSettings } from "./reminder";
import { PLAYER_SETTINGS_KEY, parsePlayerSettings } from "./player-settings";
import { LANGUAGE_KEY } from "./i18n";
import { loadInterval } from "./refresh";
import { SCHEDULE_KEY, parseRecordingRules } from "./recording-schedule";
import { POSITIONS_KEY, parsePositions } from "./positions";
import { PLAYLISTS_KEY, ACTIVE_KEY, favoritesKey } from "./playlists";
import { recentsKey } from "./backup";
import { APP_SETTINGS_KEY, parseAppSettings } from "./apk-updates";

type StorageKV = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const perPlaylist = {
  channelOverrides: channelOverridesKey, groupPreferences: groupPreferencesKey,
  parentalPins: parentalPinsKey, channelHealth: channelHealthKey,
  favoritesOrder: favoritesOrderKey, reminders: remindersKey,
};

/** Storage is injected; the wire format is validated by the same pure parsers as import. */
export function readBackupSections(storage: StorageKV, ids: string[]): BackupSections {
  const input: Record<string, unknown> = {};
  for (const [section, key] of Object.entries(perPlaylist)) {
    input[section] = Object.fromEntries(ids.map((id) => {
      const raw = storage.getItem(key(id));
      const fallback = section === "groupPreferences" ? { hidden: [], order: [] } : section === "channelHealth" ? { version: 1, failures: [] } : [];
      try { return [id, raw === null ? fallback : JSON.parse(raw)]; }
      catch { return [id, fallback]; }
    }));
  }
  const rules = parseRecordingRules(storage.getItem(SCHEDULE_KEY));
  input.recordingSchedule = Object.fromEntries(ids.map((id) => [id, rules.filter((r) => r.playlistId === id)]));
  input.playerSettings = parsePlayerSettings(storage.getItem(PLAYER_SETTINGS_KEY));
  input.appSettings = parseAppSettings(storage.getItem(APP_SETTINGS_KEY));
  input.positions = parsePositions(storage.getItem(POSITIONS_KEY));
  input.language = storage.getItem(LANGUAGE_KEY) ?? "ru";
  input.refreshInterval = loadInterval(storage);
  input.reminderSettings = parseReminderSettings(storage.getItem(REMINDER_SETTINGS_KEY));
  return parseBackupSections(input, ids).sections;
}

/** Apply validated data; roll back touched keys if a write fails. Other playlist keys remain intact. */
export function restoreBackup(storage: StorageKV, data: Backup): void {
  const writes = new Map<string, string | null>();
  const ids = new Set(data.playlists.map((p) => p.id));
  writes.set(PLAYLISTS_KEY, JSON.stringify(data.playlists));
  writes.set(ACTIVE_KEY, data.activeId);
  writes.set("iptv-hub.theme.v1", data.theme);
  for (const id of ids) {
    if (data.version === 2 || data.favorites[id]) writes.set(favoritesKey(id), JSON.stringify(data.favorites[id] ?? []));
    if (data.version === 2 || data.recents?.[id]) writes.set(recentsKey(id), JSON.stringify(data.recents?.[id] ?? []));
  }
  if (data.version === 2) {
    for (const [section, key] of Object.entries(perPlaylist)) {
      const values = data[section as keyof typeof perPlaylist];
      if (values) for (const [id, value] of Object.entries(values)) if (ids.has(id)) writes.set(key(id), JSON.stringify(value));
    }
    if (data.playerSettings) writes.set(PLAYER_SETTINGS_KEY, JSON.stringify(data.playerSettings));
    if (data.appSettings) writes.set(APP_SETTINGS_KEY, JSON.stringify(data.appSettings));
    if (data.language) writes.set(LANGUAGE_KEY, data.language);
    if (data.refreshInterval !== undefined) writes.set("iptv-hub.refresh.v1", String(data.refreshInterval));
    if (data.positions) writes.set(POSITIONS_KEY, JSON.stringify(data.positions));
    if (data.reminderSettings) writes.set(REMINDER_SETTINGS_KEY, JSON.stringify(data.reminderSettings));
    if (data.recordingSchedule) writes.set(SCHEDULE_KEY, JSON.stringify(Object.entries(data.recordingSchedule).flatMap(([id, rules]) => ids.has(id) ? rules : [])));
  }
  const previous = new Map([...writes.keys()].map((key) => [key, storage.getItem(key)]));
  const write = (key: string, value: string | null) => value === null ? storage.removeItem(key) : storage.setItem(key, value);
  try { writes.forEach((value, key) => write(key, value)); }
  catch (error) {
    // Restore only keys already owned by this import. Quota usually permits replacement/removal.
    previous.forEach((_, key) => { try { storage.removeItem(key); } catch { /* Storage itself is unavailable. */ } });
    previous.forEach((value, key) => { try { write(key, value); } catch { /* Storage itself is unavailable. */ } });
    throw error;
  }
}
