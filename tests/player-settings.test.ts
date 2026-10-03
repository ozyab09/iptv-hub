import { describe, expect, it } from "vitest";
import Hls from "hls.js";
import { DEFAULT_PLAYER_SETTINGS, parsePlayerSettings, playerHlsConfig, sanitizePlayerSettings } from "../src/player-settings";

describe("настройки плеера", () => {
  it("сохраняет прежние дефолты hls.js и диагностики", () => {
    expect(DEFAULT_PLAYER_SETTINGS).toEqual({ maxBufferLength: Hls.DefaultConfig.maxBufferLength, lowLatencyMode: false, diagnosticsTimeoutMs: 8000, limitMobileQuality: false, mobileMaxHeight: 720, autoplayLastChannel: false, volumeBoost: false, volumePercent: 100 });
  });
  it.each([null, "", "{", "null", "[]", "42", '"text"'])("испорченный JSON %s даёт дефолты", (raw) => {
    expect(parsePlayerSettings(raw)).toEqual(DEFAULT_PLAYER_SETTINGS);
  });
  it("загружает сохранённые поля и отбрасывает лишние", () => {
    expect(parsePlayerSettings(JSON.stringify({ maxBufferLength: 120, lowLatencyMode: true, diagnosticsTimeoutMs: 15000, other: 1 })))
      .toEqual({ ...DEFAULT_PLAYER_SETTINGS, maxBufferLength: 120, lowLatencyMode: true, diagnosticsTimeoutMs: 15000 });
  });
  it.each([5, 600])("принимает границу буфера %s", (maxBufferLength) => {
    expect(sanitizePlayerSettings({ maxBufferLength }).maxBufferLength).toBe(maxBufferLength);
  });
  it.each([1000, 60000])("принимает границу таймаута %s", (diagnosticsTimeoutMs) => {
    expect(sanitizePlayerSettings({ diagnosticsTimeoutMs }).diagnosticsTimeoutMs).toBe(diagnosticsTimeoutMs);
  });
  it.each([4, 601, 30.5, NaN, Infinity, "120", null, true])("отбрасывает недопустимый буфер %s", (maxBufferLength) => {
    expect(sanitizePlayerSettings({ maxBufferLength, lowLatencyMode: true }).maxBufferLength).toBe(30);
    expect(sanitizePlayerSettings({ maxBufferLength, lowLatencyMode: true }).lowLatencyMode).toBe(true);
  });
  it.each([999, 60001, 1000.5, Infinity, "8000", false])("отбрасывает недопустимый таймаут %s", (diagnosticsTimeoutMs) => {
    expect(sanitizePlayerSettings({ diagnosticsTimeoutMs }).diagnosticsTimeoutMs).toBe(8000);
  });
  it.each(["false", "true", 0, 1, null])("не преобразует %s в boolean", (lowLatencyMode) => {
    expect(sanitizePlayerSettings({ lowLatencyMode }).lowLatencyMode).toBe(false);
  });
  it("новый снимок не изменяет входные поля или дефолты", () => {
    const input = { ...DEFAULT_PLAYER_SETTINGS };
    const safe = sanitizePlayerSettings(input);
    safe.maxBufferLength = 120;
    expect(input.maxBufferLength).toBe(30);
    expect(DEFAULT_PLAYER_SETTINGS.maxBufferLength).toBe(30);
  });
  it("autoplay is opt-in and accepts only a boolean", () => {
    expect(sanitizePlayerSettings({ autoplayLastChannel: true }).autoplayLastChannel).toBe(true);
    expect(sanitizePlayerSettings({ autoplayLastChannel: "true" }).autoplayLastChannel).toBe(false);
    expect(parsePlayerSettings(null).autoplayLastChannel).toBe(false);
  });
  it("передаёт увеличенный целевой буфер в HLS без таймаута диагностики", () => {
    expect(playerHlsConfig({ ...DEFAULT_PLAYER_SETTINGS, maxBufferLength: 300, lowLatencyMode: true, diagnosticsTimeoutMs: 20000 }))
      .toEqual({ enableWorker: true, maxBufferLength: 300, lowLatencyMode: true, backBufferLength: 600 });
  });
});
