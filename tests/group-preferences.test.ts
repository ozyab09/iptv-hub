import { describe, expect, it } from "vitest";
import { groupPreferencesKey, moveGroup, orderedGroups, parseGroupPreferences, serializeGroupPreferences } from "../src/group-preferences";

describe("group preferences", () => {
  it("uses independent keys for playlists", () => {
    expect(groupPreferencesKey("one")).toBe("iptv-hub.groups.v1:one");
    expect(groupPreferencesKey("one")).not.toBe(groupPreferencesKey("two"));
  });
  it("defaults malformed storage and sanitizes arrays without changing names", () => {
    for (const raw of [null, "{", "null", "3", "[]"]) expect(parseGroupPreferences(raw)).toEqual({ hidden: new Set(), order: [] });
    expect(parseGroupPreferences('{"hidden":["News","News",null,3,"__proto__"],"order":[" Sports ",false,"News","News"]}'))
      .toEqual({ hidden: new Set(["News", "__proto__"]), order: [" Sports ", "News"] });
  });
  it("round trips hidden groups and order", () => {
    const state = { hidden: new Set(["News", "Спорт"]), order: ["Спорт", "News"] };
    expect(parseGroupPreferences(serializeGroupPreferences(state))).toEqual(state);
  });
  it("skips vanished groups, appends new ones and removes duplicates", () => {
    expect(orderedGroups(["A", "B", "C", "D"], ["C", "Missing", "C", "A"])).toEqual(["C", "A", "B", "D"]);
    expect(orderedGroups([], ["A"])).toEqual([]);
  });
  it("moves one position without modifying inputs, including hidden groups", () => {
    const groups = ["A", "B", "C"];
    const order = ["C", "B", "A"];
    expect(moveGroup(groups, order, "B", -1)).toEqual(["B", "C", "A"]);
    expect(moveGroup(groups, order, "B", 1)).toEqual(["C", "A", "B"]);
    expect(groups).toEqual(["A", "B", "C"]);
    expect(order).toEqual(["C", "B", "A"]);
  });
  it("does not move outside the list or add absent groups", () => {
    expect(moveGroup(["A", "B"], [], "A", -1)).toEqual(["A", "B"]);
    expect(moveGroup(["A", "B"], [], "B", 1)).toEqual(["A", "B"]);
    expect(moveGroup(["A", "B"], [], "Missing", -1)).toEqual(["A", "B"]);
  });
});
