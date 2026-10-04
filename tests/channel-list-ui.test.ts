import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChannelListUi, renderChannelLogo, CHANNEL_ROW_HEIGHT, type ChannelListUiDeps, type ListRow } from "../src/channel-list-ui";
import type { Channel, EpgProgramme } from "../src/types";

/** Минимальный DOM-узел для node-тестов (паттерн #123). */
class El {
  hidden = false;
  className = "";
  title = "";
  type = "";
  tabIndex = -1;
  draggable = false;
  alt = "";
  loading = "";
  src = "";
  children: (El | string)[] = [];
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  scrollTop = 0;
  clientHeight = 720;
  clientWidth = 800;
  private text = "";
  constructor(public tagName = "DIV") {}
  get textContent(): string { return this.text; }
  set textContent(v: string) { this.text = v; if (v === "") this.children = []; }
  get classList() {
    return {
      add: (c: string) => { if (!this.className.split(" ").includes(c)) this.className = `${this.className} ${c}`.trim(); },
      remove: (c: string) => { this.className = this.className.split(" ").filter((x) => x !== c).join(" "); },
      toggle: (c: string, force?: boolean) => { if (force) this.classList.add(c); else this.classList.remove(c); },
    };
  }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  addEventListener(type: string, fn: (e: unknown) => void) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes: (El | string)[]) { this.children.push(...nodes); }
  fire(type: string, e: Record<string, unknown> = {}) {
    for (const fn of this.listeners[type] ?? []) fn({ target: this, preventDefault: () => undefined, stopPropagation: () => undefined, ...e });
  }
  click() { this.fire("click"); }
  els(): El[] { return this.children.filter((c): c is El => typeof c !== "string"); }
  all(): El[] { return this.els().flatMap((c) => [c, ...c.all()]); }
  find(cls: string): El | undefined { return this.all().find((e) => e.className.split(" ").includes(cls)); }
  querySelectorAll(sel: string): El[] { return this.all().filter((e) => e.className.split(" ").includes(sel.slice(1))); }
  querySelector(sel: string): El | null {
    const m = /\[data-result-index="(\d+)"\]/.exec(sel);
    if (m) return this.all().find((e) => e.dataset.resultIndex === m[1]) ?? null;
    return this.querySelectorAll(sel)[0] ?? null;
  }
  focused = false;
  focus() { this.focused = true; }
}

const ch = (i: number, extra: Partial<Channel> = {}): Channel => ({
  name: `Channel ${i}`, normalizedName: `channel ${i}`, url: `https://x/${i}.m3u8`, tvgId: null, logo: null, group: "G",
  quality: null, catchupDays: 0, catchupSource: null, ...extra,
});
const programme: EpgProgramme = { start: "2026-10-04T10:00:00Z", stop: "2026-10-04T11:00:00Z", title: "Match", desc: null };

function harness(rows: ListRow[], opts: { favoritesView?: boolean; favorite?: boolean } = {}) {
  const list = new El();
  const calls = { played: [] as string[], programmes: [] as string[], toggled: [] as string[], edited: [] as string[], reorder: [] as string[][], toasts: [] as string[], drag: 0 };
  const deps: ChannelListUiDeps = {
    list: list as unknown as HTMLElement,
    results: () => rows,
    isCatalogue: () => false,
    isFavoritesView: () => opts.favoritesView ?? false,
    currentUrl: () => "https://x/1.m3u8",
    isFavorite: () => opts.favorite ?? false,
    failure: (url) => (url.endsWith("/2.m3u8") ? { failedAt: 1, kind: "network" } as never : undefined),
    failureLabel: () => "Не открылся",
    nowNext: (c) => (c.url.endsWith("/0.m3u8") ? { now: programme, next: null } : null),
    language: () => "en",
    toast: (m) => calls.toasts.push(m),
    play: (c) => calls.played.push(c.url),
    playProgramme: (m) => calls.programmes.push(m.programme.title),
    toggleFavorite: (c) => calls.toggled.push(c.url),
    openEditor: (c) => calls.edited.push(c.url),
    reorderFavorite: (a, b) => calls.reorder.push([a, b]),
    playlistId: () => "pl",
    onDragStart: () => { calls.drag++; },
    reminderButton: () => null,
    catalogueCard: () => new El() as unknown as HTMLElement,
    setIcon: () => undefined,
    canHover: () => true,
  };
  const ui = createChannelListUi(deps);
  const inner = () => (list.els()[0]!.els()[0]!);
  return { ui, list, calls, inner };
}

describe("createChannelListUi (#367)", () => {
  beforeEach(() => vi.stubGlobal("document", { createElement: (tag: string) => new El(tag.toUpperCase()) }));
  afterEach(() => vi.unstubAllGlobals());

  it("виртуальное окно: спейсер на весь список, строки только видимого окна", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ch(i));
    const h = harness(rows);
    h.ui.render(true);
    const spacer = h.list.els()[0]!;
    expect(spacer.className).toBe("virtual-spacer");
    expect(spacer.style.height).toBe(`${200 * CHANNEL_ROW_HEIGHT}px`);
    const shown = h.inner().els();
    expect(shown.length).toBeGreaterThan(5);
    expect(shown.length).toBeLessThan(40);
    expect(shown[0]!.dataset.resultIndex).toBe("0");
    h.list.scrollTop = 100 * CHANNEL_ROW_HEIGHT;
    h.list.fire("scroll");
    expect(Number(h.inner().els()[0]!.dataset.resultIndex)).toBeGreaterThan(80);
  });

  it("карточка: контейнер без вложенных кнопок, бейджи, сейчас в эфире, текущий канал подсвечен", () => {
    const h = harness([ch(0, { quality: "HD" }), ch(1), ch(2)]);
    h.ui.render(true);
    const [first, current, failed] = h.inner().els();
    expect(first!.tagName).toBe("DIV");
    expect(first!.find("channel-hit")!.attrs["aria-label"]).toBe("Channel 0");
    expect(first!.all().filter((e) => e.tagName === "BUTTON").every((b) => b.all().every((x) => x.tagName !== "BUTTON"))).toBe(true);
    expect(first!.find("row-now")).toBeDefined();
    expect(first!.all().some((e) => e.textContent === "HD")).toBe(true);
    expect(current!.className).toContain("on");
    expect(failed!.className).toContain("has-failure");
    expect(failed!.find("channel-failure")!.attrs["aria-label"]).toBe("Не открылся");
  });

  it("действия: клик — канал, звезда и редактирование не запускают канал, hover — превью", () => {
    const h = harness([ch(0)]);
    h.ui.render(true);
    const card = h.inner().els()[0]!;
    card.click();
    expect(h.calls.played).toEqual(["https://x/0.m3u8"]);
    card.find("star")!.click();
    expect(h.calls.toggled).toEqual(["https://x/0.m3u8"]);
    card.all().find((e) => e.dataset.channelEdit !== undefined)!.click();
    expect(h.calls.edited).toEqual(["https://x/0.m3u8"]);
    card.fire("mouseenter");
    expect(h.calls.toasts[0]).toContain("Match");
  });

  it("избранное: перетаскивание и Alt+стрелки переставляют строки", () => {
    const rows = [ch(0), ch(1), ch(2)];
    const h = harness(rows, { favoritesView: true });
    h.ui.render(true);
    const [first, second] = h.inner().els();
    expect(first!.draggable).toBe(true);
    second!.find("channel-hit")!.fire("keydown", { altKey: true, key: "ArrowUp" });
    expect(h.calls.reorder).toEqual([["https://x/1.m3u8", "https://x/0.m3u8"]]);
    const payload: Record<string, string> = {};
    first!.fire("dragstart", { dataTransfer: { setData: (k: string, v: string) => { payload[k] = v; }, effectAllowed: "" } });
    expect(h.calls.drag).toBe(1);
    second!.fire("drop", { dataTransfer: { getData: (k: string) => payload[k] ?? "" } });
    expect(h.calls.reorder[1]).toEqual(["https://x/0.m3u8", "https://x/1.m3u8"]);
  });

  it("результат поиска передач: строка со временем, Enter и клик включают передачу", () => {
    const h = harness([{ channel: ch(5), programme }]);
    h.ui.render(true);
    const row = h.inner().els()[0]!;
    expect(row.els()[1]!.els()[0]!.textContent).toBe("Channel 5 · Match");
    row.fire("keydown", { key: "Enter" });
    expect(h.calls.programmes).toEqual(["Match"]);
  });

  it("фокус: прокрутка к строке и фокус на кнопке запуска; индекс по фокусу", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ch(i));
    const h = harness(rows);
    h.ui.render(true);
    h.ui.focusAt(50);
    expect(h.list.scrollTop).toBe(50 * CHANNEL_ROW_HEIGHT);
    const row = h.inner().els().find((e) => e.dataset.resultIndex === "50")!;
    expect(row.find("channel-hit")!.focused).toBe(true);
    h.ui.render(true);
    expect(h.list.scrollTop).toBe(0);
  });
});

describe("renderChannelLogo", () => {
  beforeEach(() => vi.stubGlobal("document", { createElement: (tag: string) => new El(tag.toUpperCase()) }));
  afterEach(() => vi.unstubAllGlobals());

  it("монограмма без логотипа и после ошибки загрузки", () => {
    const plain = renderChannelLogo(ch(1)) as unknown as El;
    expect(plain.textContent).toBe("CH");
    const withLogo = renderChannelLogo(ch(1, { logo: "https://x/l.png" })) as unknown as El;
    expect(withLogo.textContent).toBe("");
    withLogo.els()[0]!.fire("error");
    expect(withLogo.textContent).toBe("CH");
  });
});
