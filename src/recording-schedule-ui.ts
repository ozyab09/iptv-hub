import { createRecordingScheduler, nextOccurrence, parseRecordingRules, SCHEDULE_KEY, type RecordingRule, type Repeat } from "./recording-schedule";
import { startScheduledRecorder } from "./scheduled-recorder";
import { t, type Language, type TranslationKey } from "./i18n";
import { loadPlaylists } from "./playlists";
import type { RecordingsFs } from "./recordings-store";
import type { Channel, EpgProgramme } from "./types";

export function createRecordingScheduleUi(deps: {
  list: HTMLElement; language(): Language; fs(): RecordingsFs | null;
  protected(rule: RecordingRule): boolean; notify(message: string): void; onSaved(): void;
}) {
  const tr = (key: TranslationKey) => t(key, deps.language());
  const read = () => parseRecordingRules(localStorage.getItem(SCHEDULE_KEY));
  const write = (rules: RecordingRule[]) => { localStorage.setItem(SCHEDULE_KEY, JSON.stringify(rules)); render(); };
  const button = (label: string, click: () => void) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-sm"; b.textContent = label; b.addEventListener("click", click); return b;
  };
  const dialog = document.createElement("dialog");
  dialog.className = "channel-editor schedule-editor";
  dialog.setAttribute("aria-labelledby", "schedule-dialog-title");
  document.body.append(dialog);
  let draft: RecordingRule | null = null;
  let signature = "";
  function edit(rule: RecordingRule) {
    draft = rule;
    dialog.replaceChildren();
    const form = document.createElement("form");
    const title = document.createElement("h2"); title.id = "schedule-dialog-title"; title.textContent = tr("schedule.title");
    const show = document.createElement("p"); show.textContent = `${rule.channelName} · ${rule.title}`;
    form.append(title, show);
    const dateField = (label: string, name: string, value: number) => {
      const wrapper = document.createElement("label"); wrapper.className = "field"; wrapper.append(label);
      const box = document.createElement("span"); box.className = "input";
      const input = document.createElement("input"); input.type = "datetime-local"; input.name = name; input.required = true; input.step = "1";
      input.value = new Date(value - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 19);
      box.append(input); wrapper.append(box); form.append(wrapper); return input;
    };
    const start = dateField(tr("schedule.start"), "start", rule.start);
    const stop = dateField(tr("schedule.stop"), "stop", rule.stop);
    const repeatLabel = document.createElement("div"); repeatLabel.className = "field"; repeatLabel.append(tr("schedule.repeat"));
    const repeatGroup = document.createElement("div"); repeatGroup.className = "seg"; repeatGroup.setAttribute("role", "radiogroup"); repeatGroup.setAttribute("aria-label", tr("schedule.repeat"));
    let repeat: Repeat = rule.repeat;
    const modes = ["once", "daily", "weekdays"] as const;
    const choices = modes.map((mode) => button(tr(`schedule.${mode}`), () => { repeat = mode; refreshRepeat(); }));
    function refreshRepeat() { choices.forEach((choice, index) => { const selected = modes[index] === repeat; choice.className = selected ? "on" : ""; choice.setAttribute("role", "radio"); choice.setAttribute("aria-checked", String(selected)); }); }
    refreshRepeat(); repeatGroup.append(...choices); repeatLabel.append(repeatGroup); form.append(repeatLabel);
    const error = document.createElement("p"); error.setAttribute("role", "alert"); form.append(error);
    const actions = document.createElement("div"); actions.className = "channel-editor-actions";
    const save = document.createElement("button"); save.type = "submit"; save.className = "btn btn-primary"; save.textContent = tr("common.save");
    actions.append(button(tr("channel.cancel"), () => dialog.close()), save); form.append(actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const from = new Date(start.value).getTime(); const until = new Date(stop.value).getTime();
      if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until <= Date.now()) { error.textContent = tr("schedule.invalid"); return; }
      if (!draft) return;
      const next: RecordingRule = { ...draft, start: from, stop: until, repeat, revision: Math.max(Date.now(), draft.revision + 1), lastStart: null, status: "scheduled" };
      try { write([...read().filter((r) => r.id !== next.id), next]); dialog.close(); }
      catch { error.textContent = tr("schedule.failed"); }
    });
    dialog.append(form); dialog.showModal(); start.focus();
  }
  dialog.addEventListener("close", () => { draft = null; });
  function render() {
    const rules = read();
    const nextSignature = JSON.stringify([rules, deps.language()]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    deps.list.replaceChildren();
    const heading = document.createElement("h3"); heading.className = "t-heading"; heading.textContent = tr("schedule.title");
    const note = document.createElement("p"); note.className = "muted t-caption"; note.textContent = tr("schedule.note");
    deps.list.append(heading, note);
    for (const rule of rules) {
      const card = document.createElement("div"); card.className = "schedule-card"; card.dataset.scheduleId = rule.id;
      const title = document.createElement("p"); title.className = "t-strong"; title.textContent = `${rule.channelName} · ${rule.title}`;
      const sub = document.createElement("p"); sub.className = "muted t-caption";
      const occurrence = nextOccurrence(rule, Date.now());
      sub.textContent = `${tr(`schedule.${rule.status}`)} · ${tr(`schedule.${rule.repeat}`)}${occurrence ? ` · ${new Date(occurrence.start).toLocaleString(deps.language())}` : ""}`;
      const actions = document.createElement("div"); actions.className = "schedule-actions";
      actions.append(button(tr("schedule.edit"), () => edit(rule)), button(tr("schedule.delete"), () => write(read().filter((r) => r.id !== rule.id))));
      card.append(title, sub, actions); deps.list.append(card);
    }
  }
  const scheduler = createRecordingScheduler({ now: Date.now, read, write, notify: deps.notify,
    start: async (rule, occurrence) => {
      const fs = deps.fs();
      if (!fs || deps.protected(rule) || !loadPlaylists(localStorage).items.some((p) => p.id === rule.playlistId)) throw new Error("Unavailable source");
      return startScheduledRecorder(rule, occurrence, fs, deps.notify, deps.onSaved, () => deps.protected(rule) || !loadPlaylists(localStorage).items.some((p) => p.id === rule.playlistId));
    },
  });
  let leader = false;
  let closed = false;
  let release: (() => void) | null = null;
  async function acquire() {
    if (leader || closed || !navigator.locks) return;
    await navigator.locks.request("iptv-hub-scheduled-recorder", { ifAvailable: true }, async (lock) => {
      if (!lock || closed) return;
      leader = true;
      write(read().map((r) => r.status === "recording" ? { ...r, status: "missed" } : r));
      const timer = window.setInterval(() => { void scheduler.tick().catch(() => deps.notify(tr("schedule.failed"))); }, 1000);
      await new Promise<void>((resolve) => { release = resolve; });
      window.clearInterval(timer);
      await scheduler.dispose();
    });
  }
  const refresh = window.setInterval(() => { render(); void acquire().catch(() => deps.notify(tr("schedule.failed"))); }, 5000);
  void acquire().catch(() => deps.notify(tr("schedule.failed")));
  window.addEventListener("pagehide", () => { closed = true; window.clearInterval(refresh); dialog.close(); release?.(); });
  render();
  return {
    render,
    plan(channel: Channel, programme: EpgProgramme, playlistId: string) {
      const rule: RecordingRule = { id: crypto.randomUUID(), playlistId, channelUrl: channel.url, channelName: channel.name, group: channel.group,
        title: programme.title, start: Date.parse(programme.start), stop: Date.parse(programme.stop), repeat: "once", revision: Date.now(), lastStart: null, status: "scheduled" };
      if (!deps.fs() || !navigator.locks || deps.protected(rule) || !/\.m3u8(?:\?|$)|[?&]type=m3u8/i.test(channel.url)) { deps.notify(tr("schedule.unavailable")); return; }
      edit(rule);
    },
  };
}
