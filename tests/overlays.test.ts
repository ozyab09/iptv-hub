import { describe, expect, it } from "vitest";
import {
  closeDownTo,
  popOverlay,
  pushOverlay,
  topOverlay,
  type OverlayName,
} from "../src/overlays";

const S: OverlayName[] = ["player", "guide"];

describe("pushOverlay", () => {
  it("кладёт оверлей на вершину", () => {
    expect(pushOverlay([], "player")).toEqual(["player"]);
    expect(pushOverlay(["player"], "guide")).toEqual(["player", "guide"]);
  });

  it("повторное открытие верхнего не раздувает стек", () => {
    expect(pushOverlay(S, "guide")).toEqual(S);
  });

  it("повторное открытие нижнего поднимает его наверх без дубля", () => {
    expect(pushOverlay(S, "player")).toEqual(["guide", "player"]);
  });
});

describe("popOverlay", () => {
  it("снимает оверлей и всё, что выше", () => {
    expect(popOverlay(["player", "guide"], "player")).toEqual([]);
    expect(popOverlay(S, "guide")).toEqual(["player"]);
  });

  it("неизвестный оверлей оставляет стек как есть", () => {
    expect(popOverlay(S, "manager")).toEqual(S);
    expect(popOverlay([], "player")).toEqual([]);
  });
});

describe("topOverlay", () => {
  it("возвращает верхний или null", () => {
    expect(topOverlay(S)).toBe("guide");
    expect(topOverlay([])).toBeNull();
  });
});

describe("closeDownTo", () => {
  it("эквивалентен popOverlay", () => {
    expect(closeDownTo(["player", "guide", "quality"], "guide")).toEqual(["player"]);
  });
});
