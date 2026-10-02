/**
 * Тесты UI-модуля менеджера плейлистов (issue #123, срез 3).
 * DOM-узлы — минимальные заглушки с нужной поверхностью; модуль получает
 * их через create, поэтому node-тесты возможны без jsdom. document и
 * window подменяются глобально: внутри renderManager создаются строки,
 * формы редактирования, а удаление зовёт window.confirm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createPlaylistUi,
  type PlaylistUiDeps,
  type PlaylistUiNodes,
} from "../src/playlist-ui";
import { t } from "../src/i18n";
import { PLAYLISTS_KEY, type Playlist, type PlaylistsState } from "../src/playlists";
import { xtreamApiUrl, xtreamEpgUrl, readXtreamUrl } from "../src/xtream";

// ---------- Фейковые DOM-узлы ----------

/** Минимальный DOM-узел: ровно то, что модуль реально трогает. */
interface FakeNode {
  tagName: string;
  hidden: boolean;
  title: string;
  value: string;
  type: string;
  className: string;
  children: FakeNode[];
  attrs: Record<string, string>;
  dataset: Record<string, string>;
  noValidate: boolean;
  classList: {
    add(...cs: string[]): void;
    contains(c: string): boolean;
    toggle(c: string, force?: boolean): boolean;
  };
  setAttribute(k: string, v: string): void;
  addEventListener(type: string, fn: (...args: unknown[]) => void): void;
  append(...nodes: FakeNode[]): void;
  contains(node: unknown): boolean;
  querySelector(sel: string): FakeNode | null;
  focus(): void;
  click(): void;
  submit(): void;
  /** Присвоение пустой строки затирает детей — как в реальном DOM. */
  textContent: string;
}

/** Ребро типизированного PlaylistUiNodes: DOM-тип → наш фейк. */
function kid(parent: unknown, index: number): FakeNode {
  return ((parent as FakeNode).children as FakeNode[])[index]!;
}
function kids(parent: unknown): FakeNode[] {
  return (parent as FakeNode).children as FakeNode[];
}
/** Атрибуты узла (set/get через setAttribute). */
function attrs(node: unknown): Record<string, string> {
  return (node as FakeNode).attrs;
}

/** Рекурсивный поиск ребёнка по классу (для querySelector в applyLanguage). */
function findByClass(root: FakeNode, cls: string): FakeNode | null {
  for (const child of root.children) {
    if (String(child.className).split(/\s+/).includes(cls)) return child;
    const deeper = findByClass(child, cls);
    if (deeper) return deeper;
  }
  return null;
}

function fakeEl(tag = "div"): FakeNode {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const classes = new Set<string>();
  const e = {
    tagName: tag.toUpperCase(),
    hidden: false,
    title: "",
    value: "",
    textContent: "",
    type: "",
    className: "",
    children: [] as FakeNode[],
    attrs: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    noValidate: false,
    classList: {
      add: (...cs: string[]) => cs.forEach((c) => classes.add(c)),
      contains: (c: string) => classes.has(c),
      toggle: (c: string, force?: boolean) => {
        const want = force === undefined ? !classes.has(c) : force;
        if (want) classes.add(c);
        else classes.delete(c);
        return want;
      },
    },
    setAttribute(k: string, v: string) {
      e.attrs[k] = v;
    },
    addEventListener(type: string, fn: (...args: unknown[]) => void) {
      (listeners[type] ??= []).push(fn);
    },
    append(...nodes: FakeNode[]) {
      e.children.push(...nodes);
    },
    contains(node: unknown) {
      if (node === e) return true;
      return e.children.some((c) => c.contains?.(node));
    },
    querySelector(sel: string) {
      return findByClass(e, sel.replace(/^\./, ""));
    },
    focus() {
      /* не важно */
    },
    click() {
      for (const fn of listeners["click"] ?? []) fn();
    },
    submit() {
      for (const fn of listeners["submit"] ?? []) fn({ preventDefault() {} });
    },
  };
  // Как в реальном DOM: присвоение textContent затирает детей.
  let text = "";
  Object.defineProperty(e, "textContent", {
    get: () => text,
    set: (v: string) => {
      text = v;
      if (v === "") e.children.length = 0;
    },
  });
  return e;
}

/** Фейковое хранилище поверх Map — как в тестах playlists.ts. */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
}

const plA: Playlist = {
  id: "a",
  name: "Первый",
  playlistUrl: "https://storage.yandexcloud.net/a.m3u",
  epgUrl: "https://storage.yandexcloud.net/epg.xml",
};
const plB: Playlist = {
  id: "b",
  name: "Второй",
  playlistUrl: "https://example.com/b.m3u8",
  epgUrl: null,
};
const stateAB: PlaylistsState = { items: [plA, plB], activeId: "a" };

function makeNodes(): PlaylistUiNodes {
  return {
    plList: fakeEl("div") as unknown as HTMLElement,
    plSwitch: fakeEl("div") as unknown as HTMLElement,
    plSwitchBtn: fakeEl("button") as unknown as HTMLButtonElement,
    plSwitchMenu: fakeEl("div") as unknown as HTMLElement,
    plSwitchName: fakeEl("span") as unknown as HTMLElement,
    plSwitchCount: fakeEl("span") as unknown as HTMLElement,
  };
}

/** Меню в index.html стартует скрытым — повторяем это в фикстуре. */
function withHiddenMenu(nodes: PlaylistUiNodes): PlaylistUiNodes {
  nodes.plSwitchMenu.hidden = true;
  return nodes;
}

/** Ответ window.confirm, который читает глобальный стаб. */
let confirmAnswer = true;

beforeEach(() => {
  vi.stubGlobal("document", {
    createElement: (tag: string) => fakeEl(tag),
  });
  vi.stubGlobal("window", {
    confirm: () => confirmAnswer,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makeDeps(state: PlaylistsState, lang: () => "ru" | "en" = () => "ru") {
  const nodes = withHiddenMenu(makeNodes());
  const storage = makeStorage();
  const calls = {
    activated: [] as string[],
    showPlayer: 0,
    errors: [] as string[],
    settingsRenders: 0,
    icons: [] as [HTMLElement, string][],
    changes: [] as PlaylistsState[],
  };
  const deps: PlaylistUiDeps = {
    nodes,
    storage,
    channelCount: () => (state.items.length > 0 ? 5 : null),
    createButton: () => fakeEl("button") as unknown as HTMLButtonElement,
    language: lang,
    icon: (el, name) => calls.icons.push([el, name]),
    showSetupError: (message) => {
      if (message) calls.errors.push(message);
    },
    showPlayer: () => void calls.showPlayer++,
    activatePlaylist: (id) => calls.activated.push(id),
    renderSettingsMode: () => void calls.settingsRenders++,
    stateChanged: (next) => calls.changes.push(next),
  };
  const ui = createPlaylistUi(deps);
  ui.sync(state);
  return { ui, nodes, storage, calls };
}

// ---------- Менеджер ----------

describe("createPlaylistUi: renderManager", () => {
  it("одна строка на плейлист, активная помечена и aria-checked", () => {
    const { ui, nodes } = makeDeps(stateAB);
    ui.renderManager();
    const rows = kids(nodes.plList);
    expect(rows).toHaveLength(2);
    expect(String(rows[0]!.className)).toContain("active");
    expect(String(rows[1]!.className)).not.toContain("active");
    const pick = kid(rows[0]!, 0);
    expect(pick.attrs["role"]).toBe("radio");
    expect(pick.attrs["aria-checked"]).toBe("true");
    expect(kid(rows[1]!, 0).attrs["aria-checked"]).toBe("false");
  });

  it("имя и источник: хост + пометка «с телепрограммой»", () => {
    const { ui, nodes } = makeDeps(stateAB);
    ui.renderManager();
    const pick = kid(kid(nodes.plList, 0), 0);
    const text = kid(pick, 1);
    expect(kid(text, 0)!.textContent).toBe("Первый");
    expect(kid(text, 1)!.textContent).toBe(
      t("playlist.withEpg", "ru", { host: "storage.yandexcloud.net" }),
    );
  });

  it("клик по неактивной строке активирует плейлист, по активной — к каналам", () => {
    const { ui, nodes, calls } = makeDeps(stateAB);
    ui.renderManager();
    kid(kid(nodes.plList, 1), 0).click();
    expect(calls.activated).toEqual(["b"]);
    kid(kid(nodes.plList, 0), 0).click();
    expect(calls.showPlayer).toBe(1);
  });

  it("кнопки редактирования и удаления получают иконки и подписи", () => {
    const { ui, nodes, calls } = makeDeps(stateAB);
    ui.renderManager();
    const row = kid(nodes.plList, 0);
    const edit = kid(row, 1);
    const del = kid(row, 2);
    // Свои edit/trash у каждой строки (две строки → четыре иконки)
    expect(calls.icons.map(([, name]) => name)).toEqual(["edit", "trash", "edit", "trash"]);
    expect(edit.title).toBe(t("playlist.editHint", "ru"));
    expect(edit.attrs["aria-label"]).toBe(t("playlist.edit", "ru", { name: "Первый" }));
    expect(del.title).toBe(t("playlist.deleteHint", "ru"));
    expect(del.attrs["aria-label"]).toBe(t("playlist.delete", "ru", { name: "Первый" }));
  });

  it("пустой список — пустой контейнер", () => {
    const { ui, nodes } = makeDeps({ items: [], activeId: null });
    ui.renderManager();
    expect(kids(nodes.plList)).toHaveLength(0);
  });
});

describe("createPlaylistUi: редактирование", () => {
  /** Открыть форму редактирования первой строки и вернуть её поля. */
  function openEdit(nodes: PlaylistUiNodes) {
    const row = kid(nodes.plList, 0);
    kid(row, 1).click(); // карандаш
    const form = kid(row, 0); // строка очищена, форма — её ребёнок
    const fields = form.children.filter((f) => f.tagName === "LABEL");
    const inputs = fields.map((f) => kid(kid(f, 1), 0));
    return { row, form, inputs };
  }

  it("клик по карандашу превращает строку в форму с тремя полями", () => {
    const { ui, nodes } = makeDeps(stateAB);
    ui.renderManager();
    const { row, inputs } = openEdit(nodes);
    expect(row.classList.contains("editing")).toBe(true);
    expect(inputs).toHaveLength(3);
    expect(inputs[0]!.value).toBe("Первый");
    expect(inputs[1]!.value).toBe("https://storage.yandexcloud.net/a.m3u");
    expect(inputs[2]!.value).toBe("https://storage.yandexcloud.net/epg.xml");
  });

  it("валидный submit обновляет плейлист и сохраняет в хранилище", () => {
    const { ui, nodes, storage } = makeDeps(stateAB);
    ui.renderManager();
    const { form, inputs } = openEdit(nodes);
    inputs[0]!.value = "Новое имя";
    inputs[2]!.value = ""; // EPG убрали
    form.submit();
    const saved = ui.getState();
    expect(saved.items[0]!.name).toBe("Новое имя");
    expect(saved.items[0]!.epgUrl).toBeNull();
    // Хранение — массив items + отдельный ключ активного (см. playlists.ts)
    expect(JSON.parse(storage.getItem(PLAYLISTS_KEY)!)[0]!.name).toBe("Новое имя");
    expect(storage.getItem("iptv-hub.active-playlist.v1")).toBe("a");
  });

  it("не-http URL отклоняется с ошибкой, состояние не меняется", () => {
    const { ui, nodes, calls } = makeDeps(stateAB);
    ui.renderManager();
    const { form, inputs } = openEdit(nodes);
    inputs[1]!.value = "javascript:alert(1)";
    form.submit();
    expect(calls.errors).toEqual([t("error.url", "ru")]);
    expect(ui.getState().items[0]!.playlistUrl).toBe("https://storage.yandexcloud.net/a.m3u");
  });

  it("пустое имя не затирает старое", () => {
    const { ui, nodes } = makeDeps(stateAB);
    ui.renderManager();
    const { form, inputs } = openEdit(nodes);
    inputs[0]!.value = "   ";
    form.submit();
    expect(ui.getState().items[0]!.name).toBe("Первый");
  });

  it("Xtream: пароль скрыт, изменение обновляет API и XMLTV и активирует источник", () => {
    const source = { host: "https://provider.test", username: "user", password: "secret" };
    const { ui, nodes, calls } = makeDeps({ items: [{ ...plA, playlistUrl: xtreamApiUrl(source, "get_live_streams"), epgUrl: xtreamEpgUrl(source) }], activeId: "a" });
    ui.renderManager();
    const { form, inputs } = openEdit(nodes);
    expect(inputs[3]!.type).toBe("password");
    expect(inputs[4]!.value).toBe("");
    inputs[3]!.value = "updated";
    form.submit();
    expect(readXtreamUrl(ui.getState().items[0]!.playlistUrl)?.password).toBe("updated");
    expect(ui.getState().items[0]!.epgUrl).toBe(xtreamEpgUrl({ ...source, password: "updated" }));
    expect(calls.activated).toEqual(["a"]);
    expect(calls.changes).toEqual([ui.getState()]);
  });

  it("Xtream: HTTP-сервер и HTTP-EPG отклоняются без сохранения", () => {
    const source = { host: "https://provider.test", username: "user", password: "secret" };
    const state = { items: [{ ...plA, playlistUrl: xtreamApiUrl(source, "get_live_streams"), epgUrl: xtreamEpgUrl(source) }], activeId: "a" };
    const { ui, nodes, calls } = makeDeps(state);
    ui.renderManager();
    const { form, inputs } = openEdit(nodes);
    inputs[1]!.value = "http://provider.test";
    form.submit();
    inputs[1]!.value = source.host;
    inputs[4]!.value = "http://provider.test/epg.xml";
    form.submit();
    expect(calls.errors).toEqual([t("error.xtreamInput", "ru"), t("error.xtreamInput", "ru")]);
    expect(ui.getState()).toEqual(state);
    expect(calls.activated).toEqual([]);
    expect(calls.changes).toEqual([]);
  });
});

describe("createPlaylistUi: удаление", () => {
  it("после подтверждения плейлист удалён, избранное вычищено", () => {
    confirmAnswer = true;
    const { ui, nodes, storage, calls } = makeDeps(stateAB);
    ui.renderManager();
    const row = kid(nodes.plList, 0);
    kid(row, 2).click(); // корзина
    expect(kids(kid(nodes.plList, 0)).length >= 0).toBe(true); // контейнер жив
    expect(ui.getState().items.map((p) => p.id)).toEqual(["b"]);
    expect(storage.getItem("iptv-hub.favorites.v1:a")).toBeNull();
    expect(calls.settingsRenders).toBe(1);
  });

  it("отмена confirm ничего не меняет", () => {
    confirmAnswer = false;
    const { ui, nodes } = makeDeps(stateAB);
    ui.renderManager();
    kid(kid(nodes.plList, 0), 2).click();
    expect(ui.getState().items).toHaveLength(2);
  });

  it("локальный плейлист чистит за собой OPFS", async () => {
    confirmAnswer = true;
    const removed: string[] = [];
    const { ui, nodes } = makeDeps({
      items: [{ ...plA, playlistUrl: "local:abc" }],
      activeId: "a",
    });
    ui.setLocalFsProvider(() =>
      Promise.resolve({
        read: async () => null,
        write: async () => undefined,
        remove: async (key) => void removed.push(key),
      }),
    );
    ui.renderManager();
    kid(kid(nodes.plList, 0), 2).click();
    // Удаление из OPFS асинхронно: даём микротаскам исполниться
    await vi.waitFor(() => expect(removed).toEqual(["local:a", "local:a:epg"]));
  });
});

// ---------- Переключатель ----------

describe("createPlaylistUi: renderSwitcher", () => {
  it("без плейлистов переключатель скрыт", () => {
    const { ui, nodes } = makeDeps({ items: [], activeId: null });
    ui.renderSwitcher();
    expect(nodes.plSwitch.hidden).toBe(true);
  });

  it("название, aria и счётчик каналов", () => {
    const { ui, nodes } = makeDeps(stateAB);
    ui.renderSwitcher();
    expect(nodes.plSwitch.hidden).toBe(false);
    expect(nodes.plSwitchName.textContent).toBe("Первый");
    expect(attrs(nodes.plSwitchBtn)["aria-label"]).toBe(
      t("playlist.switchNamed", "ru", { name: "Первый" }),
    );
    expect(nodes.plSwitchCount.textContent).toContain("5");
  });

  it("нет каналов (плейлист ещё грузится) — счётчик пустой", () => {
    const nodes = withHiddenMenu(makeNodes());
    const ui = createPlaylistUi({
      nodes,
      storage: makeStorage(),
      channelCount: () => null,
      createButton: () => fakeEl("button") as unknown as HTMLButtonElement,
      language: () => "ru",
      icon: () => undefined,
      showSetupError: () => undefined,
      showPlayer: () => undefined,
      activatePlaylist: () => undefined,
      renderSettingsMode: () => undefined,
      stateChanged: () => undefined,
    });
    ui.sync(stateAB);
    ui.renderSwitcher();
    expect(nodes.plSwitchCount.textContent).toBe("");
  });

  it("пункты меню: один на плейлист, активный выделен, клик активирует", () => {
    const { ui, nodes, calls } = makeDeps(stateAB);
    ui.renderSwitcher();
    const items = kids(nodes.plSwitchMenu);
    expect(items).toHaveLength(2);
    expect(String(items[0]!.className)).toContain("on");
    expect(String(items[1]!.className)).not.toContain("on");
    items[1]!.click();
    expect(calls.activated).toEqual(["b"]);
    expect(nodes.plSwitchMenu.hidden).toBe(true);
    expect(attrs(nodes.plSwitchBtn)["aria-expanded"]).toBe("false");
  });

  it("toggleSwitcherMenu раскрывает и сворачивает меню с aria-expanded", () => {
    const { ui, nodes } = makeDeps(stateAB);
    ui.toggleSwitcherMenu();
    expect(nodes.plSwitchMenu.hidden).toBe(false);
    expect(attrs(nodes.plSwitchBtn)["aria-expanded"]).toBe("true");
    ui.toggleSwitcherMenu();
    expect(nodes.plSwitchMenu.hidden).toBe(true);
    expect(attrs(nodes.plSwitchBtn)["aria-expanded"]).toBe("false");
  });

  it("клик мимо закрывает открытое меню, клик по переключателю — нет", () => {
    const { ui, nodes } = makeDeps(stateAB);
    ui.toggleSwitcherMenu();
    expect(ui.closeSwitcherIfOutside(nodes.plSwitch)).toBe(false);
    expect(nodes.plSwitchMenu.hidden).toBe(false);
    expect(ui.closeSwitcherIfOutside(null)).toBe(true);
    expect(nodes.plSwitchMenu.hidden).toBe(true);
    expect(attrs(nodes.plSwitchBtn)["aria-expanded"]).toBe("false");
    // закрытое меню не трогаем
    expect(ui.closeSwitcherIfOutside(null)).toBe(false);
  });
});

// ---------- Синхронизация и язык ----------

describe("createPlaylistUi: sync/applyLanguage", () => {
  it("renderManager(next) принимает состояние параметром", () => {
    const { ui, nodes } = makeDeps({ items: [], activeId: null });
    ui.renderManager(stateAB);
    expect(kids(nodes.plList)).toHaveLength(2);
    expect(ui.getState().activeId).toBe("a");
  });

  it("applyLanguage переводит подписи без пересоздания списка", () => {
    let lang: "ru" | "en" = "ru";
    const { ui, nodes } = makeDeps(stateAB, () => lang);
    ui.renderManager();
    // Вторая строка неактивна — у неё тайтл «Открыть этот плейлист»
    const pick = kid(nodes.plList, 1).querySelector(".pl-pick")!;
    expect(pick.title).toBe(t("playlist.pick", "ru"));
    expect(kids(nodes.plList)).toHaveLength(2);
    lang = "en";
    ui.applyLanguage();
    expect(kids(nodes.plList)).toHaveLength(2); // список не пересоздан
    expect(pick.title).toBe(t("playlist.pick", "en"));
  });

  it("редактируемая строка переживает смену языка", () => {
    let lang: "ru" | "en" = "ru";
    const { ui, nodes } = makeDeps(stateAB, () => lang);
    ui.renderManager();
    const row = kid(nodes.plList, 1); // неактивная: тайтл playlist.pick
    row.classList.add("editing");
    lang = "en";
    ui.applyLanguage();
    const pick = row.querySelector(".pl-pick")!;
    expect(pick.title).toBe(t("playlist.pick", "ru")); // не переведена
  });
});
