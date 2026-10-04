import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuideUi, type GuideUiDeps } from "../src/guide-ui";
import type { DownloadStatus } from "../src/programme-downloader";
import type { Channel, EpgProgramme } from "../src/types";
import { t } from "../src/i18n";

/** Минимальный DOM-узел для node-тестов (паттерн #123). */
class El {
  hidden = false;
  disabled = false;
  className = "";
  title = "";
  type = "";
  innerHTML = "";
  children: El[] = [];
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  focused = false;
  private text = "";
  constructor(public tagName = "DIV") {}
  get textContent(): string { return this.text; }
  set textContent(v: string) { this.text = v; if (v === "") this.children = []; }
  get childElementCount(): number { return this.children.length; }
  get classList() {
    return {
      toggle: (c: string, force?: boolean) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force ?? !set.has(c)) set.add(c); else set.delete(c);
        this.className = [...set].join(" ");
      },
      contains: (c: string) => this.className.split(/\s+/).includes(c),
    };
  }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  addEventListener(type: string, fn: (e: unknown) => void) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes: (El | string)[]) { for (const n of nodes) if (typeof n !== "string") this.children.push(n); }
  click() { for (const fn of this.listeners.click ?? []) fn({ target: this }); }
  focus() { this.focused = true; }
  all(): El[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelectorAll(sel: string): El[] { return this.all().filter((e) => e.classList.contains(sel.slice(1))); }
  querySelector(sel: string): El | null { return this.querySelectorAll(sel)[0] ?? null; }
}

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 4, 12);
const prog = (offsetH: number, title: string, desc: string | null = null): EpgProgramme => ({
  start: new Date(NOW + offsetH * HOUR).toISOString(),
  stop: new Date(NOW + (offsetH + 1) * HOUR).toISOString(),
  title,
  desc,
});
const channel: Channel = {
  name: "Alpha", normalizedName: "alpha", url: "https://x/a.m3u8", tvgId: "a", logo: null, group: "G",
  quality: null, catchupDays: 3, catchupSource: "https://x/archive.m3u8?utc={utc}",
};
const programmes = [prog(-2, "Old"), prog(-1, "Past", "Описание прошлой"), prog(-0.5, "Live"), prog(0.5, "Next"), prog(1.5, "Later")];

function harness(opts: { channel?: Channel | null; programmes?: EpgProgramme[]; compact?: boolean; status?: DownloadStatus | null } = {}) {
  const el = () => new El();
  const nodes = {
    overlay: el(), title: el(), days: el(), list: el(), grid: el(), listMode: el(), gridMode: el(),
    schedule: el(), scheduleList: el(), downloadStatus: el(),
    card: { overlay: el(), title: el(), meta: el(), desc: el(), actions: el(), close: el() },
  };
  nodes.card.overlay.hidden = true;
  const calls = {
    played: [] as { url?: string; title?: string }[], toasts: [] as string[], opened: [] as string[], closed: [] as string[],
    planned: [] as string[], started: [] as string[], cancelled: 0, timeline: 0,
  };
  let status = opts.status ?? null;
  const deps: GuideUiDeps = {
    nodes: nodes as unknown as GuideUiDeps["nodes"],
    channel: () => (opts.channel === undefined ? channel : opts.channel),
    programmes: () => opts.programmes ?? programmes,
    archiveProgramme: () => null,
    language: () => "en",
    toast: (m) => calls.toasts.push(m),
    playChannel: async (_c, url, p) => { calls.played.push({ url, title: p?.title }); return true; },
    isCompact: () => opts.compact ?? false,
    renderTimeline: () => { calls.timeline++; },
    openOverlay: (n) => { calls.opened.push(n); if (n === "programme") nodes.card.overlay.hidden = false; },
    closeOverlay: (n) => { calls.closed.push(n); },
    playlistId: () => "pl",
    planRecording: (_c, p) => calls.planned.push(p.title),
    reminderButton: () => { const b = new El("BUTTON"); b.className = "programme-reminder"; return b as unknown as HTMLElement; },
    downloads: {
      status: () => status,
      start: (_c, p, url) => { calls.started.push(`${p.title}|${url}`); },
      cancel: () => { calls.cancelled++; status = null; },
    },
    setIcon: () => undefined,
    win: { addEventListener: () => undefined } as unknown as Window,
  };
  return { ui: createGuideUi(deps), nodes, calls };
}

const rows = (root: El) => root.children.filter((c) => c.className === "programme-recordable");
const rowButton = (wrapper: El) => wrapper.children[0]!;
const byTitle = (root: El, title: string) => rows(root).find((w) => rowButton(w).children[1]!.children[0]!.textContent === title)!;

describe("createGuideUi (#368)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal("document", { createElement: (tag: string) => new El(tag.toUpperCase()) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("блок под плеером: одна прошедшая, текущая и следующие; ключ текущей передачи", () => {
    const h = harness();
    h.ui.renderSchedule();
    expect(h.nodes.schedule.hidden).toBe(false);
    expect(rows(h.nodes.scheduleList).map((w) => rowButton(w).children[1]!.children[0]!.textContent)).toEqual(["Past", "Live", "Next", "Later"]);
    expect(h.ui.scheduleKey()).toBe(`${channel.url}|${programmes[2]!.start}`);
  });

  it("без текущей передачи блок скрыт и ключ пуст", () => {
    const h = harness({ programmes: [prog(5, "Far")] });
    h.ui.renderSchedule();
    expect(h.nodes.schedule.hidden).toBe(true);
    expect(h.ui.scheduleKey()).toBe("");
  });

  it("строки: эфир включает канал, архив — catchup-URL, прошлое получает скачивание, будущее — запись и напоминание", async () => {
    const h = harness();
    h.ui.renderSchedule();
    const live = byTitle(h.nodes.scheduleList, "Live");
    expect(rowButton(live).disabled).toBe(false);
    rowButton(live).click();
    const past = byTitle(h.nodes.scheduleList, "Past");
    expect(rowButton(past).title).toContain("Описание прошлой");
    rowButton(past).click();
    await vi.waitFor(() => expect(h.calls.played).toHaveLength(2));
    expect(h.calls.played[0]).toEqual({ url: undefined, title: undefined });
    expect(h.calls.played[1]!.url).toContain("archive.m3u8?utc=");
    expect(past.children.slice(1).map((c) => c.className)).toEqual(["icon-btn programme-info", "btn btn-sm programme-download"]);
    const next = byTitle(h.nodes.scheduleList, "Next");
    expect(next.children.slice(2).map((c) => c.className)).toEqual(["btn btn-sm schedule-programme", "programme-reminder"]);
    next.children[2]!.click();
    expect(h.calls.planned).toEqual(["Next"]);
  });

  it("прошлое без архива недоступно и без скачивания", () => {
    const h = harness({ channel: { ...channel, catchupDays: 0, catchupSource: null } });
    h.ui.renderSchedule();
    const past = byTitle(h.nodes.scheduleList, "Past");
    expect(rowButton(past).disabled).toBe(true);
    expect(rowButton(past).className).toContain("dim");
    expect(past.children).toHaveLength(2);
  });

  it("карточка передачи: текст EPG, статус, действия; без описания блок скрыт", async () => {
    const h = harness();
    h.ui.renderSchedule();
    byTitle(h.nodes.scheduleList, "Past").children[1]!.click();
    expect(h.calls.opened).toEqual(["programme"]);
    expect(h.nodes.card.title.textContent).toBe("Past");
    expect(h.nodes.card.meta.textContent).toContain(t("programme.statusPast", "en"));
    expect(h.nodes.card.desc.textContent).toBe("Описание прошлой");
    expect(h.nodes.card.desc.hidden).toBe(false);
    expect(h.nodes.card.close.focused).toBe(true);
    h.nodes.card.actions.children[0]!.click();
    await vi.waitFor(() => expect(h.calls.closed).toEqual(["programme"]));
    byTitle(h.nodes.scheduleList, "Next").children[1]!.click();
    expect(h.nodes.card.desc.hidden).toBe(true);
    expect(h.nodes.card.actions.children.map((c) => c.className)).toEqual(["btn btn-sm schedule-programme", "programme-reminder"]);
  });

  it("скачивание: старт с catchup-URL, своя кнопка отменяет, чужие ждут", () => {
    const h = harness();
    h.ui.renderSchedule();
    const button = byTitle(h.nodes.scheduleList, "Past").children[2]!;
    expect(button.textContent).toBe(t("download.title", "en"));
    button.click();
    expect(h.calls.started[0]).toMatch(/^Past\|https:\/\/x\/archive\.m3u8\?utc=/);

    const busy = harness({ status: { channelName: "Alpha", channelUrl: channel.url, start: programmes[1]!.start, title: "Past", url: "u", progress: 0.42 } });
    busy.ui.renderSchedule();
    const mine = byTitle(busy.nodes.scheduleList, "Past").children[2]!;
    expect(mine.textContent).toBe(t("download.progress", "en", { pct: 42 }));
    busy.ui.refreshDownloads();
    expect(busy.nodes.downloadStatus.hidden).toBe(false);
    mine.click();
    expect(busy.calls.cancelled).toBe(1);
    expect(busy.calls.toasts).toEqual([t("download.cancelled", "en")]);
  });

  it("шторка: дни, пустой день, сетка недоступна на узком экране", () => {
    const h = harness({ programmes: [] , channel: { ...channel, catchupSource: null } });
    h.ui.open();
    expect(h.calls.opened).toEqual(["guide"]);
    expect(h.nodes.days.children.length).toBeGreaterThan(1);
    expect(h.nodes.list.children[0]!.textContent).toBe(t("guide.noDay", "en"));
    const compact = harness({ compact: true });
    compact.ui.setMode(true);
    expect(compact.ui.isGrid()).toBe(false);
    expect(compact.calls.toasts).toEqual([t("guide.mobile", "en")]);
    const wide = harness();
    wide.ui.setMode(true);
    expect(wide.ui.isGrid()).toBe(true);
    expect(wide.calls.timeline).toBe(1);
  });

  it("без канала шторка не открывается", () => {
    const h = harness({ channel: null });
    h.ui.open();
    expect(h.calls.opened).toEqual([]);
  });
});
