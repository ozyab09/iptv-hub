import type { Channel, EpgProgramme } from "./types";
import { t, type Language } from "./i18n";
import { createReminderScheduler, parseReminders, parseReminderSettings, reminderId, remindersKey, toggleReminder, REMINDER_SETTINGS_KEY, type ProgrammeReminder } from "./reminder";

export function createProgrammeReminders(nodes: {
  root: ParentNode; minutes: HTMLInputElement; desktop: HTMLInputElement; status: HTMLElement;
}, deps: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  playlistIds: () => string[];
  language: () => Language;
  notify: (reminder: ProgrammeReminder, playlistId: string) => void;
  watch: (playlistId: string, channelUrl: string) => void;
}) {
  const tr = (key: Parameters<typeof t>[0], params = {}) => t(key, deps.language(), params);
  const cache = new Map<string, ProgrammeReminder[]>();
  let storageFailed = false;
  function read(id: string): ProgrammeReminder[] {
    if (storageFailed) return cache.get(id) ?? [];
    try { const list = parseReminders(deps.storage.getItem(remindersKey(id))); cache.set(id, list); return list; }
    catch { storageFailed = true; return cache.get(id) ?? []; }
  }
  function write(id: string, list: ProgrammeReminder[]): void {
    cache.set(id, list);
    try {
      if (list.length) deps.storage.setItem(remindersKey(id), JSON.stringify(list));
      else deps.storage.removeItem(remindersKey(id));
    } catch { storageFailed = true; }
  }
  let settings = parseReminderSettings(null);
  try { settings = parseReminderSettings(deps.storage.getItem(REMINDER_SETTINGS_KEY)); } catch { /* Defaults. */ }
  function saveSettings(): void {
    try { deps.storage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Current tab. */ }
  }
  function render(syncSettings = false): void {
    if (syncSettings) {
      nodes.minutes.value = String(settings.minutes);
      nodes.desktop.checked = settings.desktop && typeof Notification !== "undefined" && Notification.permission === "granted";
    }
    nodes.desktop.disabled = typeof Notification === "undefined";
    if (nodes.desktop.disabled) nodes.status.textContent = tr("reminder.unsupported");
    const lists = new Map(deps.playlistIds().map((id) => [id, read(id)]));
    nodes.root.querySelectorAll<HTMLButtonElement>(".programme-reminder").forEach((button) => {
      const item = lists.get(button.dataset.playlist!)?.find((r) => reminderId(r) === button.dataset.reminder);
      button.setAttribute("aria-pressed", String(!!item));
      button.textContent = tr(item ? "reminder.cancel" : "reminder.add");
      button.title = tr("reminder.lead", { minutes: item?.leadMinutes ?? settings.minutes });
      button.disabled = Number(button.dataset.start) <= Date.now();
    });
  }
  nodes.minutes.addEventListener("change", () => {
    settings.minutes = parseReminderSettings(JSON.stringify({ minutes: Number(nodes.minutes.value) })).minutes;
    saveSettings(); render(true);
  });
  nodes.desktop.addEventListener("change", async () => {
    const requested = nodes.desktop.checked;
    if (!requested) { settings.desktop = false; saveSettings(); return; }
    const permission = await Notification.requestPermission();
    settings.desktop = requested && nodes.desktop.checked && permission === "granted";
    nodes.status.textContent = permission === "granted" ? "" : tr("reminder.denied");
    saveSettings(); render(true);
  });
  function deliver(item: ProgrammeReminder, id: string): void {
    deps.notify(item, id);
    if (settings.desktop && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const notification = new Notification(tr("reminder.title"), { body: `${item.channelName} · ${item.title}`, tag: `${id}:${reminderId(item)}` });
        notification.onclick = () => { window.focus(); deps.watch(id, item.channelUrl); notification.close(); };
      } catch { /* In-app delivery remains available, including on mobile. */ }
    }
  }
  let busy = false;
  let closed = false;
  async function tick(): Promise<void> {
    if (busy || closed) return;
    busy = true;
    const run = () => {
      if (closed) return;
      for (const id of deps.playlistIds()) createReminderScheduler({ now: Date.now, read: () => read(id), write: (list) => write(id, list), notify: (item) => deliver(item, id) }).tick();
      render();
    };
    try {
      if (navigator.locks) await navigator.locks.request("iptv-hub-reminders", { ifAvailable: true }, (lock) => { if (lock) run(); });
      else run();
    } finally { busy = false; }
  }
  let timer = window.setInterval(() => { void tick(); }, 1000);
  window.addEventListener("pagehide", () => { closed = true; window.clearInterval(timer); });
  window.addEventListener("pageshow", () => { if (closed) { closed = false; timer = window.setInterval(() => { void tick(); }, 1000); } });
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === REMINDER_SETTINGS_KEY) {
      try { settings = parseReminderSettings(deps.storage.getItem(REMINDER_SETTINGS_KEY)); } catch { /* Current tab. */ }
    }
    if (event.key === null || event.key === REMINDER_SETTINGS_KEY || event.key.startsWith("iptv-hub.reminders.v1:")) render(true);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void tick(); });
  render(true);
  return {
    render,
    button(channel: Channel, programme: EpgProgramme, playlistId: string): HTMLButtonElement | null {
      const start = Date.parse(programme.start);
      if (start <= Date.now()) return null;
      const button = document.createElement("button");
      button.type = "button"; button.className = "btn btn-sm programme-reminder";
      button.dataset.playlist = playlistId;
      button.dataset.reminder = reminderId({ channelUrl: channel.url, start });
      button.dataset.start = String(start);
      const saved = read(playlistId).find((r) => reminderId(r) === button.dataset.reminder);
      button.textContent = tr(saved ? "reminder.cancel" : "reminder.add");
      button.setAttribute("aria-pressed", String(!!saved));
      button.title = tr("reminder.lead", { minutes: saved?.leadMinutes ?? settings.minutes });
      button.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        write(playlistId, toggleReminder(read(playlistId), { channelUrl: channel.url, channelName: channel.name, title: programme.title,
          start, stop: Date.parse(programme.stop), leadMinutes: settings.minutes }, Date.now()));
        render(); void tick();
      });
      return button;
    },
  };
}
