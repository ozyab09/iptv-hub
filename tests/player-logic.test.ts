import { describe, it, expect } from "vitest";
import {
  httpToHttps,
  neighborIndex,
  MAX_MEDIA_RECOVERIES,
  MEDIA_RECOVERY_WINDOW_MS,
  nextMediaRecovery,
  shouldRecoverMedia,
  shouldRetryNetwork,
  skipTarget,
} from "../src/player";

describe("httpToHttps (mixed content rescue)", () => {
  it("upgrades public http URLs", () => {
    expect(httpToHttps("http://cdn.example.com/live.m3u8")).toBe(
      "https://cdn.example.com/live.m3u8",
    );
    expect(httpToHttps("http://cdn.example.com:80/live.m3u8?tok=1")).toBe(
      "https://cdn.example.com/live.m3u8?tok=1",
    );
  });

  it("keeps explicit non-80 ports", () => {
    expect(httpToHttps("http://cdn.example.com:8080/live.m3u8")).toBe(
      "https://cdn.example.com:8080/live.m3u8",
    );
  });

  it("returns null for local/private hosts (no TLS expected)", () => {
    expect(httpToHttps("http://localhost:5173/x.m3u8")).toBeNull();
    expect(httpToHttps("http://127.0.0.1/x.m3u8")).toBeNull();
    expect(httpToHttps("http://[::1]/x.m3u8")).toBeNull();
    expect(httpToHttps("http://10.0.0.5/x.m3u8")).toBeNull();
    expect(httpToHttps("http://192.168.1.10:8000/x.m3u8")).toBeNull();
    expect(httpToHttps("http://172.16.0.1/x.m3u8")).toBeNull();
    expect(httpToHttps("http://172.31.255.1/x.m3u8")).toBeNull();
    expect(httpToHttps("http://mybox.local/x.m3u8")).toBeNull();
  });

  it("returns null for non-http schemes and garbage", () => {
    expect(httpToHttps("https://a.tv/x.m3u8")).toBeNull();
    expect(httpToHttps("ftp://a.tv/x")).toBeNull();
    expect(httpToHttps("javascript:alert(1)")).toBeNull();
    expect(httpToHttps("not a url")).toBeNull();
    expect(httpToHttps("")).toBeNull();
  });
});

describe("shouldRetryNetwork", () => {
  it("даёт несколько попыток восстановиться", () => {
    expect(shouldRetryNetwork(1)).toBe(true);
    expect(shouldRetryNetwork(3)).toBe(true);
  });
  it("сдаётся после предела — иначе мёртвый поток переподключается вечно", () => {
    expect(shouldRetryNetwork(4)).toBe(false);
    expect(shouldRetryNetwork(99)).toBe(false);
  });
});

describe("media error recovery limit (#350)", () => {
  it("первые восстановления разрешены, следующая подряд ошибка — сдаваться", () => {
    let state = nextMediaRecovery(null, 0);
    expect(state.count).toBe(1);
    expect(shouldRecoverMedia(state.count)).toBe(true);
    for (let i = 1; i < MAX_MEDIA_RECOVERIES; i++) state = nextMediaRecovery(state, i * 1000);
    expect(shouldRecoverMedia(state.count)).toBe(true);
    state = nextMediaRecovery(state, 10_000);
    expect(state.count).toBe(MAX_MEDIA_RECOVERIES + 1);
    expect(shouldRecoverMedia(state.count)).toBe(false);
  });

  it("ошибка после окна тишины считается первой — редкие сбои эфира не копятся", () => {
    const state = nextMediaRecovery({ count: MAX_MEDIA_RECOVERIES, at: 0 }, MEDIA_RECOVERY_WINDOW_MS);
    expect(state.count).toBe(1);
    expect(shouldRecoverMedia(state.count)).toBe(true);
  });
});

describe("neighborIndex (prev/next channel)", () => {
  it("returns null for an empty list", () => {
    expect(neighborIndex(0, 0, 1)).toBeNull();
  });

  it("steps forward and wraps around", () => {
    expect(neighborIndex(0, 5, 1)).toBe(1);
    expect(neighborIndex(4, 5, 1)).toBe(0);
  });

  it("steps backward and wraps around", () => {
    expect(neighborIndex(2, 5, -1)).toBe(1);
    expect(neighborIndex(0, 5, -1)).toBe(4);
  });

  it("handles single-element list", () => {
    expect(neighborIndex(0, 1, 1)).toBe(0);
    expect(neighborIndex(0, 1, -1)).toBe(0);
  });
});

describe("skipTarget (±15s seek)", () => {
  it("returns null for live streams", () => {
    expect(skipTarget(10, -15, 0, true)).toBeNull();
    expect(skipTarget(10, 15, Infinity, true)).toBeNull();
  });

  it("clamps to [0, duration]", () => {
    expect(skipTarget(5, -15, 600, false)).toBe(0);
    expect(skipTarget(595, 15, 600, false)).toBe(600);
  });

  it("moves by delta within bounds", () => {
    expect(skipTarget(100, 15, 600, false)).toBe(115);
    expect(skipTarget(100, -15, 600, false)).toBe(85);
  });

  it("handles NaN currentTime", () => {
    expect(skipTarget(NaN, 15, 600, false)).toBeNull();
  });
});
