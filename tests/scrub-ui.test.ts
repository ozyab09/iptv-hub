import { describe, expect, it, vi } from "vitest";
import { createScrubUi, type ScrubUiDeps } from "../src/scrub-ui";
import type { EpgProgramme } from "../src/types";

class El {
  style: Record<string, string> = {};
  textContent = "";
  tabIndex = -1;
  attrs: Record<string, string> = {};
  listeners: Record<string, (e: unknown) => void> = {};
  captured = new Set<number>();
  focused = false;
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  addEventListener(type: string, fn: (e: unknown) => void) { this.listeners[type] = fn; }
  getBoundingClientRect() { return { left: 0, width: 100 }; }
  setPointerCapture(id: number) { this.captured.add(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  focus() { this.focused = true; }
  fire(type: string, e: Record<string, unknown> = {}) {
    this.listeners[type]?.({ preventDefault: () => undefined, stopPropagation: () => undefined, ...e });
  }
}

const HOUR = 3_600_000;
const prog = (start: number, title = "Show"): EpgProgramme => ({ start: new Date(start).toISOString(), stop: new Date(start + HOUR).toISOString(), title, desc: null });

function harness(opts: { recording?: boolean; duration?: number; archive?: EpgProgramme | null; live?: EpgProgramme | null; scheduleKey?: string } = {}) {
  const nodes = { scrub: new El(), fill: new El(), miniFill: new El(), start: new El(), end: new El(), show: new El(), timeLeft: new El() };
  const video = { readyState: opts.recording ? 1 : 0, duration: opts.duration ?? NaN, currentTime: 0 };
  const calls = { seek: [] as number[], schedule: 0, wake: 0, refresh: 0 };
  let ui: ReturnType<typeof createScrubUi>;
  const deps: ScrubUiDeps = {
    nodes: nodes as unknown as ScrubUiDeps["nodes"],
    video: video as unknown as HTMLVideoElement,
    isRecording: () => opts.recording ?? false,
    recordingDurationSec: () => opts.duration ?? 0,
    seekBy: (s) => calls.seek.push(s),
    archiveProgramme: () => opts.archive ?? null,
    liveProgramme: () => opts.live ?? null,
    channelUrl: () => "https://x/a",
    scheduleKey: () => opts.scheduleKey ?? "",
    renderSchedule: () => { calls.schedule++; },
    language: () => "en",
    wake: () => { calls.wake++; },
    refresh: () => { calls.refresh++; ui.render(); },
  };
  ui = createScrubUi(deps);
  return { ui, nodes, video, calls };
}

describe("createScrubUi (#369)", () => {
  it("локальная запись: slider с mm:ss, обе полоски синхронны", () => {
    const h = harness({ recording: true, duration: 120 });
    h.video.currentTime = 30;
    h.ui.render();
    expect(h.nodes.scrub.attrs.role).toBe("slider");
    expect(h.nodes.scrub.tabIndex).toBe(0);
    expect(h.nodes.scrub.attrs["aria-valuenow"]).toBe("30");
    expect(h.nodes.scrub.attrs["aria-valuetext"]).toBe("00:30 / 02:00");
    expect(h.nodes.fill.style.width).toBe("25.0%");
    expect(h.nodes.miniFill.style.width).toBe("25.0%");
    expect(h.nodes.show.textContent).toBe("");
  });

  it("drag показывает выбранную позицию, seek — при pointerup; отмена возвращает текущую", () => {
    const h = harness({ recording: true, duration: 100 });
    h.ui.render();
    h.nodes.scrub.fire("pointerdown", { button: 0, isPrimary: true, pointerId: 1, clientX: 40 });
    expect(h.ui.isDragging()).toBe(true);
    expect(h.nodes.scrub.focused).toBe(true);
    expect(h.calls.wake).toBe(1);
    h.nodes.scrub.fire("pointermove", { pointerId: 1, clientX: 70 });
    expect(h.nodes.scrub.attrs["aria-valuenow"]).toBe("70");
    expect(h.video.currentTime).toBe(0);
    h.nodes.scrub.fire("pointerup", { pointerId: 1, clientX: 70 });
    expect(h.video.currentTime).toBe(70);
    expect(h.ui.isDragging()).toBe(false);

    h.nodes.scrub.fire("pointerdown", { button: 0, isPrimary: true, pointerId: 2, clientX: 10 });
    h.nodes.scrub.fire("pointercancel", { pointerId: 2 });
    expect(h.ui.isDragging()).toBe(false);
    expect(h.nodes.scrub.attrs["aria-valuenow"]).toBe("70");
  });

  it("клавиши: стрелки ±15 с, Home/End — края файла", () => {
    const h = harness({ recording: true, duration: 100 });
    h.ui.render();
    h.nodes.scrub.fire("keydown", { key: "ArrowRight" });
    h.nodes.scrub.fire("keydown", { key: "ArrowLeft" });
    expect(h.calls.seek).toEqual([15, -15]);
    h.nodes.scrub.fire("keydown", { key: "End" });
    expect(h.video.currentTime).toBe(100);
    h.nodes.scrub.fire("keydown", { key: "Home" });
    expect(h.video.currentTime).toBe(0);
  });

  it("эфир: ход передачи, «ещё N мин», полоса не интерактивна", () => {
    vi.useFakeTimers();
    const start = Date.UTC(2026, 9, 4, 12);
    vi.setSystemTime(start + 15 * 60_000);
    const h = harness({ live: prog(start, "News") });
    h.ui.render();
    expect(h.nodes.scrub.attrs.role).toBeUndefined();
    expect(h.nodes.fill.style.width).toBe("25.0%");
    expect(h.nodes.show.textContent).toBe("News");
    expect(h.nodes.timeLeft.textContent).toContain("45");
    expect(h.calls.schedule).toBe(1);
    h.nodes.scrub.fire("pointerdown", { button: 0, isPrimary: true, pointerId: 1, clientX: 50 });
    expect(h.ui.isDragging()).toBe(false);
    vi.useRealTimers();
  });

  it("архив: позиция = начало передачи + currentTime", () => {
    const start = Date.UTC(2026, 9, 4, 8);
    const h = harness({ archive: prog(start, "Archived"), scheduleKey: `https://x/a|${new Date(start).toISOString()}` });
    h.video.currentTime = 1800;
    h.ui.render();
    expect(h.nodes.fill.style.width).toBe("50.0%");
    expect(h.calls.schedule).toBe(0);
  });

  it("без передачи полоса пуста, программа под плеером сбрасывается", () => {
    const h = harness({ scheduleKey: "old" });
    h.ui.render();
    expect(h.nodes.fill.style.width).toBe("0%");
    expect(h.nodes.start.textContent).toBe("");
    expect(h.calls.schedule).toBe(1);
  });
});
