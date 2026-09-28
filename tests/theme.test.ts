import { describe, it, expect } from "vitest";
import {
  resolveTheme,
  toggleTheme,
  saveTheme,
  isTheme,
  themeButtonLabel,
  THEME_STORAGE_KEY,
} from "../src/theme";

const store = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

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
    expect(themeButtonLabel("dark")).toBe("☀️");
    expect(themeButtonLabel("light")).toBe("🌙");
  });
});

describe("storage key", () => {
  it("is versioned", () => {
    expect(THEME_STORAGE_KEY).toBe("iptv-hub.theme.v1");
  });
});
