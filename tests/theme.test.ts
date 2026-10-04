import { describe, it, expect } from "vitest";
import {
  applyTheme,
  syncStatusBarAppearance,
  resolveTheme,
  toggleTheme,
  saveTheme,
  isTheme,
  themeButtonLabel,
  THEME_STORAGE_KEY,
  themeChoice,
  clearTheme,
} from "../src/theme";
import { memoryStorage as store } from "./fakes/storage";


describe("resolveTheme", () => {
  it("prefers the saved user choice", () => {
    const s = store();
    saveTheme("light", s);
    expect(resolveTheme(s, true)).toBe("light");
  });

  it("falls back to the system preference", () => {
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme(null, true)).toBe("dark");
  });

  it("defaults to dark when nothing is known", () => {
    expect(resolveTheme(null, null)).toBe("dark");
  });

  it("ignores broken storage", () => {
    const s = store();
    const spy = s as { getItem: (k: string) => string | null };
    spy.getItem = () => {
      throw new Error("blocked");
    };
    expect(resolveTheme(s as Storage, true)).toBe("dark");
  });
});

describe("toggleTheme", () => {
  it("flips", () => {
    expect(toggleTheme("dark")).toBe("light");
    expect(toggleTheme("light")).toBe("dark");
  });
});

describe("isTheme", () => {
  it("validates", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("blue")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe("themeButtonLabel", () => {
  it("shows the target theme", () => {
    expect(themeButtonLabel("dark")).toBe("sun");
    expect(themeButtonLabel("light")).toBe("moon");
  });
});

describe("storage key", () => {
  it("is versioned", () => {
    expect(THEME_STORAGE_KEY).toBe("iptv-hub.theme.v1");
  });
});

describe("выбор темы в настройках", () => {
  const mem = store;

  it("без сохранённой темы — «как в системе»", () => {
    expect(themeChoice(mem())).toBe("system");
    expect(themeChoice(null)).toBe("system");
  });

  it("сохранённая тема читается как выбор", () => {
    const s = mem();
    saveTheme("light", s);
    expect(themeChoice(s)).toBe("light");
  });

  it("«как в системе» стирает выбор, и тема снова идёт от системы", () => {
    const s = mem();
    saveTheme("light", s);
    clearTheme(s);
    expect(themeChoice(s)).toBe("system");
    expect(resolveTheme(s, true)).toBe("dark");
  });
});

// #360: meta theme-color следует за фактической темой (значение из --bg).
describe("applyTheme → meta theme-color", () => {
  function fakeDoc(bgByTheme: Record<string, string>) {
    const metas = [{ content: "#0c0d10" }, { content: "#f6f6f8" }];
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    const doc = {
      documentElement: root,
      defaultView: {
        getComputedStyle: () => ({ getPropertyValue: (name: string) => (name === "--bg" ? ` ${bgByTheme[root.dataset.theme ?? ""] ?? ""}` : "") }),
      },
      querySelectorAll: () => metas,
    };
    return { doc: doc as unknown as Document, metas, root };
  }

  it("светлая тема красит обе меты в светлый фон, тёмная — в тёмный", () => {
    const { doc, metas, root } = fakeDoc({ light: "#f6f6f8", dark: "#0c0d10" });
    applyTheme("light", doc);
    expect(root.dataset.theme).toBe("light");
    expect(metas.map((m) => m.content)).toEqual(["#f6f6f8", "#f6f6f8"]);
    applyTheme("dark", doc);
    expect(metas.map((m) => m.content)).toEqual(["#0c0d10", "#0c0d10"]);
  });

  it("без токена меты не трогаются", () => {
    const { doc, metas } = fakeDoc({});
    applyTheme("light", doc);
    expect(metas.map((m) => m.content)).toEqual(["#0c0d10", "#f6f6f8"]);
  });
});

describe("Android status-bar bridge", () => {
  it("follows theme, expanded compact player, closing and screen width", () => {
    const messages: string[] = [];
    let watching = false;
    let open = false;
    const view = { innerWidth: 390, IPTVHubStatusBar: { postMessage: (value: string) => messages.push(value) } };
    const doc = {
      documentElement: { dataset: { theme: "light" } },
      defaultView: view,
      getElementById: (id: string) => ({ classList: { contains: () => id === "app" ? watching : open } }),
    } as unknown as Document;
    syncStatusBarAppearance(doc);
    watching = true;
    syncStatusBarAppearance(doc);
    open = true;
    syncStatusBarAppearance(doc);
    doc.documentElement.dataset.theme = "dark";
    syncStatusBarAppearance(doc);
    doc.documentElement.dataset.theme = "light";
    view.innerWidth = 1440;
    syncStatusBarAppearance(doc);
    view.innerWidth = 390;
    watching = false;
    syncStatusBarAppearance(doc);
    expect(messages).toEqual(["light", "light", "dark", "dark", "light", "light"]);
  });
});
