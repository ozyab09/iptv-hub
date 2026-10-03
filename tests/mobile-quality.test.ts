import { describe, expect, it } from "vitest";
import { mobileQualityCap, needsMobileQualityCap } from "../src/mobile-quality";
import { sanitizePlayerSettings } from "../src/player-settings";

describe("mobile quality policy", () => {
  it("is opt-in and does nothing without the API", () => {
    expect(needsMobileQualityCap(false, { type: "cellular" })).toBe(false);
    expect(needsMobileQualityCap(true, null)).toBe(false);
  });
  it("prefers physical network type over speed estimates", () => {
    expect(needsMobileQualityCap(true, { type: "cellular", effectiveType: "4g" })).toBe(true);
    for (const type of ["wifi", "ethernet"]) expect(needsMobileQualityCap(true, { type, effectiveType: "2g" })).toBe(false);
  });
  it("falls back to slow connection classes when type is unknown", () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) expect(needsMobileQualityCap(true, { effectiveType })).toBe(true);
    expect(needsMobileQualityCap(true, { effectiveType: "4g" })).toBe(false);
    expect(needsMobileQualityCap(true, {})).toBe(false);
  });
  it("caps the ABR prefix and falls back to the lowest available level", () => {
    expect(mobileQualityCap([{ height: 360 }, { height: 720 }, { height: 1080 }], 720)).toBe(1);
    expect(mobileQualityCap([{ height: 1080 }], 720)).toBe(0);
    expect(mobileQualityCap([], 720)).toBe(-1);
    expect(mobileQualityCap([{ height: 0 }, { height: 480 }], 720)).toBe(1);
    expect(mobileQualityCap([{ height: 360 }, { height: 1080 }, { height: 720 }], 720)).toBe(0);
  });
  it("validates persisted opt-in and resolution independently", () => {
    expect(sanitizePlayerSettings({ limitMobileQuality: true, mobileMaxHeight: 480 })).toMatchObject({ limitMobileQuality: true, mobileMaxHeight: 480 });
    expect(sanitizePlayerSettings({ limitMobileQuality: "true", mobileMaxHeight: "480" })).toMatchObject({ limitMobileQuality: false, mobileMaxHeight: 720 });
    expect(sanitizePlayerSettings({ mobileMaxHeight: 600 }).mobileMaxHeight).toBe(720);
  });
});
