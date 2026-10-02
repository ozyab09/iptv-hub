import { describe, expect, it } from "vitest";
import { appendZapDigit, zapChannelIndex, ZAP_DELAY_MS } from "../src/numeric-zap";

describe("numeric ZAP", () => {
  it("collects 2 then 5 and extends the idle deadline", () => {
    const first = appendZapDigit(null, "2", 0);
    expect(first).toEqual({ digits: "2", deadline: ZAP_DELAY_MS });
    const second = appendZapDigit(first, "5", 900);
    expect(second).toEqual({ digits: "25", deadline: 1900 });
    expect(zapChannelIndex(second!.digits, 100)).toBe(24);
  });
  it("starts a new number at and after the deadline", () => {
    const first = appendZapDigit(null, "2", 0);
    expect(appendZapDigit(first, "5", 999)?.digits).toBe("25");
    expect(appendZapDigit(first, "5", 1000)?.digits).toBe("5");
    expect(appendZapDigit(first, "5", 2000)?.digits).toBe("5");
  });
  it("ignores keys other than individual ASCII digits", () => {
    const state = appendZapDigit(null, "0", 0);
    for (const key of ["", "25", "a", "２", " "]) expect(appendZapDigit(state, key, 10)).toBe(state);
  });
  it("supports first, last, leading zeros and four digit channel numbers", () => {
    expect(zapChannelIndex("1", 25)).toBe(0);
    expect(zapChannelIndex("25", 25)).toBe(24);
    expect(zapChannelIndex("0025", 25)).toBe(24);
    expect(zapChannelIndex("1000", 1000)).toBe(999);
  });
  it("rejects empty, zero, out of range, unsafe and non-digit numbers", () => {
    for (const digits of ["", "0", "000", "26", "9007199254740993", "-1", "1.0", "1e1", " 1"]) expect(zapChannelIndex(digits, 25)).toBeNull();
    expect(zapChannelIndex("1", 0)).toBeNull();
  });
});
