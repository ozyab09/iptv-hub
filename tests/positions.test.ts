import { describe, expect, it } from "vitest";
import {
  clearPosition,
  loadPosition,
  savePosition,
  POSITIONS_TTL_MS,
} from "../src/positions";
import type { PositionKV } from "../src/positions";

function kv(): { store: PositionKV; dump: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    store: {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    } as PositionKV,
    dump: () => Object.fromEntries(map),
  };
}

const NOW = 1_000_000_000_000;
const URL = "https://vod/example.mp4";

describe("positions", () => {
  it("save → load: позиция возвращается", () => {
    const { store } = kv();
    savePosition(store, URL, 123.5, NOW);
    expect(loadPosition(store, URL, NOW + 1000)).toBe(123.5);
  });

  it("позиции < 1 сек не хранятся", () => {
    const { store } = kv();
    savePosition(store, URL, 0, NOW);
    expect(loadPosition(store, URL, NOW)).toBeNull();
  });

  it("устаревшая позиция (старше TTL) отбрасывается", () => {
    const { store } = kv();
    savePosition(store, URL, 50, NOW);
    expect(loadPosition(store, URL, NOW + POSITIONS_TTL_MS + 1)).toBeNull();
    // и чистится
    expect(loadPosition(store, URL, NOW + POSITIONS_TTL_MS + 2)).toBeNull();
  });

  it("почти досмотренное (> duration − 15с) — null, начинать сначала", () => {
    const { store } = kv();
    savePosition(store, URL, 590, NOW);
    expect(loadPosition(store, URL, NOW, 600)).toBeNull();
    expect(loadPosition(store, URL, NOW, Infinity)).toBe(590);
  });

  it("clearPosition удаляет", () => {
    const { store } = kv();
    savePosition(store, URL, 42, NOW);
    clearPosition(store, URL);
    expect(loadPosition(store, URL, NOW)).toBeNull();
  });

  it("null storage — тихий no-op", () => {
    savePosition(null, URL, 42, NOW);
    expect(loadPosition(null, URL, NOW)).toBeNull();
  });

  it("битый JSON трактуется как пусто", () => {
    const { store, dump } = kv();
    store!.setItem("iptv-hub.positions.v1", "{oops");
    expect(loadPosition(store, URL, NOW)).toBeNull();
    expect(dump()["iptv-hub.positions.v1"]).toBe("{oops");
  });
});
