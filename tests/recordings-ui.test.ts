import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecordingsUi, type RecordingsUiDeps } from "../src/recordings-ui";
import { RECORDINGS_KEY, loadRecordings, type RecordingMeta } from "../src/recordings";
import { PENDING_RECORDING_KEY } from "../src/recording-recovery";
import { t } from "../src/i18n";

/** Минимальный DOM-узел: ровно то, что модуль трогает. */
interface FakeEl {
  tagName: string;
  hidden: boolean;
  className: string;
  title: string;
  type: string;
  innerHTML: string;
  children: FakeEl[];
  dataset: Record<string, string>;
  attrs: Record<string, string>;
  listeners: Record<string, () => void>;
  textContent: string;
  setAttribute(k: string, v: string): void;
  addEventListener(type: string, fn: () => void): void;
  append(...nodes: FakeEl[]): void;
  click(): void;
  remove(): void;
}

function fakeEl(tag = "div"): FakeEl {
  let text = "";
  const el: FakeEl = {
    tagName: tag.toUpperCase(),
    hidden: false,
    className: "",
    title: "",
    type: "",
    innerHTML: "",
    children: [],
    dataset: {},
    attrs: {},
    listeners: {},
    get textContent() { return text; },
    set textContent(v: string) { text = v; if (v === "") el.children = []; },
    setAttribute(k, v) { el.attrs[k] = v; },
    addEventListener(type, fn) { el.listeners[type] = fn; },
    append(...nodes) { el.children.push(...nodes); },
    click() { el.listeners.click?.(); },
    remove() { /* узел снят */ },
  };
  return el;
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  };
}

const rec: RecordingMeta = {
  id: "r1", channelName: "Первый", channelUrl: "https://x/1", programmeTitle: "Новости",
  startedAt: Date.UTC(2026, 8, 30, 12), durationSec: 65, sizeBytes: 2048, ext: "ts",
};

function harness(opts: { fs?: boolean; active?: boolean } = {}) {
  const files = new Map<string, Blob>();
  const storage = memoryStorage();
  const nodes = { screen: fakeEl(), empty: fakeEl(), list: fakeEl() };
  const calls = { toasts: [] as string[], actions: [] as string[], played: [] as string[], subtitles: [] as string[], deleted: [] as string[], before: 0 };
  const deps: RecordingsUiDeps = {
    nodes: nodes as unknown as RecordingsUiDeps["nodes"],
    fs: () => opts.fs === false ? null : {
      read: async (name) => (files.get(name) as File | undefined) ?? null,
      write: async (name, blob) => void files.set(name, blob),
      remove: async (name) => void files.delete(name),
      list: async () => [...files.keys()],
    },
    storage: () => storage,
    isActive: () => opts.active ?? true,
    language: () => "ru",
    toast: (m) => calls.toasts.push(m),
    toastAction: (m) => calls.actions.push(m),
    play: (_file, r) => calls.played.push(r.id),
    chooseSubtitles: (r) => calls.subtitles.push(r.id),
    onDeleted: (id) => calls.deleted.push(id),
    beforeRender: () => { calls.before++; },
    makeId: () => "new",
  };
  return { ui: createRecordingsUi(deps), files, storage, nodes, calls };
}

const card = (nodes: { list: FakeEl }, i = 0) => nodes.list.children[i]!;
const play = (c: FakeEl) => c.children[0]!;
const actions = (c: FakeEl) => c.children[1]!.children;

describe("createRecordingsUi (#365)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: fakeEl, body: fakeEl("body") });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    vi.stubGlobal("window", { setTimeout: () => 0 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("список: карточка с названием передачи, подписью и тремя действиями", () => {
    const h = harness();
    h.storage.setItem(RECORDINGS_KEY, JSON.stringify([rec]));
    h.ui.render();
    expect(h.calls.before).toBe(1);
    expect(h.nodes.screen.hidden).toBe(false);
    expect(h.nodes.empty.hidden).toBe(true);
    const c = card(h.nodes);
    expect(c.className).toBe("recording-card");
    expect(play(c).children[0]!.textContent).toBe("Новости");
    expect(play(c).children[1]!.textContent).toContain("Первый");
    expect(play(c).children[1]!.textContent).toContain("1:05");
    expect(actions(c).map((a) => a.attrs["aria-label"])).toEqual([
      t("record.downloadLabel", "ru"), t("record.delete", "ru"), t("player.subtitlesFile", "ru"),
    ]);
  });

  it("раздел закрыт — экран скрыт, карточки не строятся; пусто — подсказка", () => {
    const closed = harness({ active: false });
    closed.storage.setItem(RECORDINGS_KEY, JSON.stringify([rec]));
    closed.ui.render();
    expect(closed.nodes.screen.hidden).toBe(true);
    expect(closed.nodes.list.children).toHaveLength(0);
    const empty = harness();
    empty.ui.render();
    expect(empty.nodes.empty.hidden).toBe(false);
  });

  it("клик по карточке играет файл, отсутствующий файл — тост", async () => {
    const h = harness();
    h.storage.setItem(RECORDINGS_KEY, JSON.stringify([rec]));
    h.ui.render();
    play(card(h.nodes)).click();
    await vi.waitFor(() => expect(h.calls.toasts).toEqual([t("error.recordMissing", "ru")]));
    h.files.set("done-r1.ts", new Blob([new Uint8Array(3)]));
    play(card(h.nodes)).click();
    await vi.waitFor(() => expect(h.calls.played).toEqual(["r1"]));
  });

  it("удаление снимает файл, запись и выбор субтитров, сообщает main", async () => {
    const h = harness();
    h.storage.setItem(RECORDINGS_KEY, JSON.stringify([rec]));
    h.storage.setItem("iptv-hub.recording-subtitles.v1:r1", JSON.stringify({ name: "a.srt", enabled: true }));
    h.files.set("done-r1.ts", new Blob([new Uint8Array(3)]));
    h.ui.render();
    actions(card(h.nodes))[1]!.click();
    await vi.waitFor(() => expect(h.calls.deleted).toEqual(["r1"]));
    expect(h.files.has("done-r1.ts")).toBe(false);
    expect(loadRecordings(h.storage)).toEqual([]);
    expect(h.storage.getItem("iptv-hub.recording-subtitles.v1:r1")).toBeNull();
  });

  it("кнопка CC отдаёт запись выбору субтитров", () => {
    const h = harness();
    h.storage.setItem(RECORDINGS_KEY, JSON.stringify([rec]));
    h.ui.render();
    actions(card(h.nodes))[2]!.click();
    expect(h.calls.subtitles).toEqual(["r1"]);
  });

  it("saveToLibrary: файл в OPFS, запись в списке, метка восстановления снята, скачивание предложено", async () => {
    const h = harness();
    h.storage.setItem(PENDING_RECORDING_KEY, JSON.stringify({ channelName: "Первый", startedAt: 1 }));
    const blob = new Blob([new Uint8Array(10)]);
    await h.ui.saveToLibrary(blob, "ts", { channelName: "Первый", channelUrl: "u", programmeTitle: null, startedAt: rec.startedAt, durationSec: 5 });
    expect(h.files.has("done-new.ts")).toBe(true);
    expect(loadRecordings(h.storage)).toEqual([{ id: "new", channelName: "Первый", channelUrl: "u", programmeTitle: null, startedAt: rec.startedAt, durationSec: 5, sizeBytes: 10, ext: "ts" }]);
    expect(h.storage.getItem(PENDING_RECORDING_KEY)).toBeNull();
    expect(h.calls.actions).toEqual([t("record.autoDownload", "ru")]);
  });

  it("без OPFS — сразу скачивание, библиотека не трогается", async () => {
    const h = harness({ fs: false });
    await h.ui.saveToLibrary(new Blob([new Uint8Array(1)]), "webm", { channelName: "A", channelUrl: "", programmeTitle: null, startedAt: 1, durationSec: 1 });
    expect(loadRecordings(h.storage)).toEqual([]);
    expect(h.calls.actions).toHaveLength(1);
  });
});
