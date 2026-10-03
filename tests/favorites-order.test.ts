import { expect, it } from "vitest";
import { applyFavoritesOrder, favoritesOrderKey, moveFavorite, parseFavoritesOrder } from "../src/favorites-order";
import type { Channel } from "../src/types";

const channels = ["A", "B", "C", "D"].map((name) => ({ name, url: name }) as Channel);
const favorites = new Set(["A", "B", "C"]);

it("uses separate keys and defaults malformed or duplicate order data", () => {
  expect(favoritesOrderKey("one")).toBe("iptv-hub.favorites-order.v1:one");
  expect(favoritesOrderKey("two")).not.toBe(favoritesOrderKey("one"));
  for (const raw of [null, "{", "null", "3", "{}"]) expect(parseFavoritesOrder(raw)).toEqual([]);
  expect(parseFavoritesOrder('["A",null,3,"C","A",""]')).toEqual(["A", "C"]);
});

it("keeps manual order, skips missing/non-favorites, appends new entries and preserves inputs", () => {
  const order = ["C", "Missing", "C", "D", "A"];
  expect(applyFavoritesOrder(channels, favorites, order).map((c) => c.url)).toEqual(["C", "A", "B"]);
  expect(applyFavoritesOrder(channels, new Set(), order)).toEqual([]);
  expect(order).toEqual(["C", "Missing", "C", "D", "A"]);
  expect(channels.map((c) => c.url)).toEqual(["A", "B", "C", "D"]);
});

it("moves either direction to a target position without mutating the source", () => {
  const order = ["A", "B", "C"];
  expect(moveFavorite(order, "C", "A")).toEqual(["C", "A", "B"]);
  expect(moveFavorite(order, "A", "C")).toEqual(["B", "C", "A"]);
  expect(moveFavorite(order, "B", "A")).toEqual(["B", "A", "C"]);
  expect(moveFavorite(order, "B", "C")).toEqual(["A", "C", "B"]);
  expect(order).toEqual(["A", "B", "C"]);
});

it("ignores unknown or identical drag targets", () => {
  for (const [url, target] of [["A", "A"], ["Missing", "B"], ["A", "Missing"]]) {
    expect(moveFavorite(["A", "B"], url!, target!)).toEqual(["A", "B"]);
  }
});

it("appends re-added favorites after their previous position is removed", () => {
  const order = applyFavoritesOrder(channels, new Set(["A", "B"]), ["C", "A", "B"]).map((c) => c.url);
  expect(applyFavoritesOrder(channels, favorites, order).map((c) => c.url)).toEqual(["A", "B", "C"]);
});
