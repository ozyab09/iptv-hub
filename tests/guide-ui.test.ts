import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuideUi, type GuideUiDeps } from "../src/guide-ui";
import type { RecordingMeta } from "../src/recordings";
import type { RecordingsFs } from "../src/recordings-store";
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

function harness(opts: { channel?: Channel | null; programmes?: EpgProgramme[]; compact?: boolean; status?: DownloadStatus | null; recordings?: RecordingMeta[]; recordingsFs?: RecordingsFs | null } = {}) {
  const el = () => new El();
  const nodes = {
    overlay: el(), title: el(), days: el(), list: el(),
    schedule: el(), scheduleList: el(), downloadStatus: el(),
    card: { overlay: el(), title: el(), meta: el(), desc: el(), actions: el(), close: el() },
  };
  nodes.card.overlay.hidden = true;
  const calls = {
    played: [] as { url?: string; title?: string }[], toasts: [] as string[], opened: [] as string[], closed: [] as string[],
    planned: [] as string[], started: [] as string[], cancelled: 0, localDownloads: [] as { id: string; title?: string }[],
  };
  let status = opts.status ?? null;
  const deps: GuideUiDeps = {
    nodes: nodes as unknown as GuideUiDeps["nodes"],
    channel: () => (opts.channel === undefined ? channel : opts.channel),
    programmes: () => opts.programmes ?? programmes,
    archiveProgramme: () => null,
    language: () => "en",
    toast: (m) => calls.toasts.push(m),
    toastAction: (_message, _actionLabel, action) => { action(); },
    playChannel: async (_c, url, p) => { calls.played.push({ url, title: p?.title }); return true; },
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
    recordings: () => opts.recordings ?? [],
    recordingsFs: opts.recordingsFs ?? null,
    localDownload: async (rec, p) => { calls.localDownloads.push({ id: rec.id, title: p?.title }); },
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
    // Без локальной записи показывается кнопка скачивания из архива
    expect(past.children.length).toBeGreaterThanOrEqual(2);
    expect(past.children.find((c) => c.classList.contains("programme-download"))).toBeDefined();
    const next = byTitle(h.nodes.scheduleList, "Next");
    expect(next.children.length).toBeGreaterThanOrEqual(3);
    expect(next.children.find((c) => c.classList.contains("programme-download"))).toBeDefined();
    expect(next.children.find((c) => c.classList.contains("schedule-programme"))).toBeDefined();
    expect(next.children.find((c) => c.classList.contains("programme-reminder"))).toBeDefined();
    next.children.find((c) => c.classList.contains("schedule-programme"))!.click();
    expect(h.calls.planned).toEqual(["Next"]);
  });

  it("прошлое без архива: строка приглушена, клик сообщает, что перемотать нельзя (#472)", () => {
    const h = harness({ channel: { ...channel, catchupDays: 0, catchupSource: null } });
    h.ui.renderSchedule();
    const past = byTitle(h.nodes.scheduleList, "Past");
    expect(rowButton(past).disabled).toBe(false);
    expect(rowButton(past).className).toContain("dim");
    rowButton(past).click();
    expect(h.calls.toasts).toEqual([t("guide.noSeek", "en")]);
    expect(h.calls.played).toEqual([]);
    expect(past.children).toHaveLength(2); // без кнопки скачивания
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

  it("шторка: дни, пустой день; вкладок списка/сетки больше нет (#472)", () => {
    const h = harness({ programmes: [] , channel: { ...channel, catchupSource: null } });
    h.ui.open();
    expect(h.calls.opened).toEqual(["guide"]);
    expect(h.nodes.days.children.length).toBeGreaterThan(1);
    expect(h.nodes.list.children[0]!.textContent).toBe(t("guide.noDay", "en"));
  });

  it("канал без EPG: часовая сетка под плеером, серое «Без названия», клик по прошедшему слоту без архива — тост (#472)", () => {
    const bare = { ...channel, catchupDays: 0, catchupSource: null };
    const h = harness({ channel: bare, programmes: [] });
    h.ui.renderSchedule();
    expect(h.nodes.schedule.hidden).toBe(false);
    const titles = rows(h.nodes.scheduleList).map((w) => rowButton(w).children[1]!.children[0]!);
    // 1 прошедший + текущий + 2 будущих
    expect(titles).toHaveLength(4);
    for (const title of titles) expect(title.textContent).toBe(t("guide.noTitle", "en"));
    // Прошедший слот кликабелен и сообщает, что перемотать нельзя
    const pastRow = rowButton(rows(h.nodes.scheduleList)[0]!);
    expect(pastRow.disabled).toBe(false);
    expect(pastRow.className).toContain("dim");
    pastRow.click();
    expect(h.calls.toasts).toEqual([t("guide.noSeek", "en")]);
    // Будущие слоты неактивны
    expect(rowButton(rows(h.nodes.scheduleList)[3]!).disabled).toBe(true);
    // Текущий час включает канал как эфир
    rowButton(rows(h.nodes.scheduleList)[1]!).click();
    expect(h.calls.played).toHaveLength(1);
  });

  it("канал без EPG с архивом: прошедший слот открывается через catchup (#472)", async () => {
    const h = harness({ channel, programmes: [] });
    h.ui.renderSchedule();
    rowButton(rows(h.nodes.scheduleList)[0]!).click();
    await vi.waitFor(() => expect(h.calls.played).toHaveLength(1));
    expect(h.calls.played[0]!.url).toContain("archive.m3u8?utc=");
    expect(h.calls.toasts).toEqual([]);
  });

  it("без канала шторка не открывается", () => {
    const h = harness({ channel: null });
    h.ui.open();
    expect(h.calls.opened).toEqual([]);
  });

  it("прошлое: локальная запись > архив; без записи — архив (#474)", () => {
    const rec = { id: "rec", channelName: "Канал", channelUrl: channel.url, programmeTitle: "Past", startedAt: Date.parse(programmes[1]!.start), durationSec: 60, sizeBytes: 1024, ext: "ts" } as RecordingMeta;
    const h = harness({ recordings: [rec] });
    h.ui.render();
    const wrapper = byTitle(h.nodes.list, "Past");
    const downloadBtn = wrapper.querySelector(".programme-download") as El | null;
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn!.dataset.downloadChannel).toBe(channel.url);
    expect(downloadBtn!.dataset.downloadStart).toBe(programmes[1]!.start);
    downloadBtn!.click();
    expect(h.calls.localDownloads).toEqual([{ id: "rec", title: "Past" }]);
    expect(h.calls.started).toEqual([]);
  });

  it("прошлое без локальной записи: скачивание из архива", () => {
    const h = harness({ recordings: [] });
    h.ui.render();
    const wrapper = byTitle(h.nodes.list, "Past");
    const downloadBtn = wrapper.querySelector(".programme-download") as El | null;
    expect(downloadBtn).not.toBeNull();
    downloadBtn!.click();
    expect(h.calls.started).toEqual(["Past|https://x/archive.m3u8?utc=" + String(Math.floor(Date.parse(programmes[1]!.start) / 1000))]);
  });

  it("будущее: скачивание из архива, если доступен (#474)", () => {
    const h = harness({ recordings: [] });
    h.ui.render();
    const wrapper = byTitle(h.nodes.list, "Next");
    const downloadBtn = wrapper.querySelector(".programme-download") as El | null;
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn!.dataset.downloadChannel).toBe(channel.url);
    downloadBtn!.click();
    expect(h.calls.started).toEqual(["Next|https://x/archive.m3u8?utc=" + String(Math.floor(Date.parse(programmes[3]!.start) / 1000))]);
  });

  it("live: локальная запись — скачивание; без записи — кнопок нет", () => {
    const liveRec = { id: "live", channelName: "Канал", channelUrl: channel.url, programmeTitle: "Live", startedAt: Date.parse(programmes[2]!.start), durationSec: 60, sizeBytes: 1024, ext: "ts" } as RecordingMeta;
    const hWith = harness({ recordings: [liveRec] });
    hWith.ui.render();
    const wrapper = byTitle(hWith.nodes.list, "Live");
    expect(wrapper.querySelector(".programme-download")).not.toBeNull();
    wrapper.querySelector(".programme-download")!.click();
    expect(hWith.calls.localDownloads).toEqual([{ id: "live", title: "Live" }]);

    const hWithout2 = harness({ recordings: [] });
    hWithout2.ui.render();
    const wrapper2 = byTitle(hWithout2.nodes.list, "Live");
    expect(wrapper2.querySelector(".programme-download")).toBeNull();
  });
});
