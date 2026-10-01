import { describe, expect, it } from "vitest";
import { createPinHash, isValidPin, parentalPinsKey, parseParentalPins, serializeParentalPins, verifyPin } from "../src/parental-pin";

describe("parental PIN", () => {
  it("accepts only 4–8 ASCII digits, preserving leading zeroes", () => {
    for (const pin of ["0000", "12345678"]) expect(isValidPin(pin)).toBe(true);
    for (const pin of ["123", "123456789", " 1234", "abcd", "１２３４", "1234\n"]) expect(isValidPin(pin)).toBe(false);
  });
  it("hashes with random salt and verifies the exact PIN", async () => {
    const first = await createPinHash("0123");
    const second = await createPinHash("0123");
    expect(first).not.toEqual(second);
    expect(await verifyPin("0123", first)).toBe(true);
    expect(await verifyPin("1230", first)).toBe(false);
    expect(await verifyPin("123", first)).toBe(false);
    await expect(createPinHash("abc")).rejects.toThrow();
  });
  it("round-trips groups without exposing PINs; isolates playlists", async () => {
    const pins = new Map([["__proto__", await createPinHash("9876")]]);
    const raw = serializeParentalPins(pins);
    expect(Object.keys(JSON.parse(raw)[0]).sort()).toEqual(["group", "hash", "salt"]);
    expect(parseParentalPins(raw)).toEqual(pins);
    expect(parentalPinsKey("one")).not.toBe(parentalPinsKey("two"));
  });
  it("ignores malformed records", () => {
    for (const raw of [null, "{", "{}", '[null,{}, {"group":"Kids","salt":"x","hash":"x"}]']) {
      expect(parseParentalPins(raw).size).toBe(0);
    }
  });
});
