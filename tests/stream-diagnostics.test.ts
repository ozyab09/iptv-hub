import { describe, it, expect, vi } from "vitest";
import {
  probeStream,
  probeVerdict,
  corsChecklist,
  httpChecklist,
  type ProbeResult,
} from "../src/stream-diagnostics";

const answered = (status: number) => async () => ({ ok: status >= 200 && status < 300, status });

describe("probeStream", () => {
  it("сервер ответил с CORS — ok, статус передан", async () => {
    const fetchImpl = vi.fn(answered(200));
    const out = await probeStream("https://a/s.m3u8", fetchImpl);
    expect(out).toEqual({ kind: "ok", status: 200 });
    expect(fetchImpl).toHaveBeenCalledWith("https://a/s.m3u8", { method: "GET", mode: "cors" });
  });

  it("сервер ответил, но с ошибкой — http со статусом", async () => {
    const out = await probeStream("https://a/s.m3u8", answered(403));
    expect(out).toEqual({ kind: "http", status: 403 });
  });

  it("TypeError (нет CORS / недоступен) — blocked", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError("Failed to fetch");
    };
    const out = await probeStream("https://a/s.m3u8", fetchImpl);
    expect(out).toEqual({ kind: "blocked" });
  });

  it("таймаут тоже считается blocked", async () => {
    const fetchImpl = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")));
      });
    const out = await probeStream("https://a/s.m3u8", fetchImpl as unknown as typeof fetch, 10);
    expect(out).toEqual({ kind: "blocked" });
  });
});

describe("probeVerdict", () => {
  it("называет каждую причину словами", () => {
    const ok: ProbeResult = { kind: "ok", status: 200 };
    expect(probeVerdict(ok)).toContain("не в нём");
    const http: ProbeResult = { kind: "http", status: 503 };
    expect(probeVerdict(http)).toContain("503");
    expect(probeVerdict({ kind: "blocked" })).toContain("CORS");
  });
});

describe("checklists", () => {
  it("CORS-чек-лист называет и запрет прокси, и консоль", () => {
    const text = corsChecklist();
    expect(text).toContain("MSE");
    expect(text).toContain("Safari");
    expect(text).toContain("прокси");
    expect(text).toContain("F12");
  });

  it("HTTP-чек-лист различает 403 и 404", () => {
    expect(httpChecklist(403)).toContain("403");
    expect(httpChecklist(404)).toContain("404");
    expect(httpChecklist(503)).toContain("503");
  });
});
