import type { EpgProgramme } from "./types";
import { computeWindow, type VirtualWindow } from "./virtual-list";

export const TIMELINE_ROW_HEIGHT = 64;
export const TIMELINE_SLOT_WIDTH = 96;
export const TIMELINE_SLOT_MS = 30 * 60_000;
export const TIMELINE_CHANNEL_WIDTH = 176;
export const TIMELINE_HEADER_HEIGHT = 36;

/** Независимые окна строк и получасовых колонок с двумя элементами запаса. */
export function timelineWindow(rows: number, columns: number, left: number, top: number, width: number, height: number): { rows: VirtualWindow; columns: VirtualWindow } {
  const axis = (count: number, scroll: number, viewport: number, pitch: number) => computeWindow(
    Math.max(0, Math.min(scroll, Math.max(0, count * pitch - viewport))), viewport, count, pitch, 2,
  );
  return {
    rows: axis(rows, top, height, TIMELINE_ROW_HEIGHT),
    columns: axis(columns, left, width, TIMELINE_SLOT_WIDTH),
  };
}

/** Видимые передачи; координаты сохраняют ширину по длительности внутри дня. */
export function timelineProgrammes(programmes: readonly EpgProgramme[], startMs: number, endMs: number, columns: VirtualWindow): { programme: EpgProgramme; left: number; width: number }[] {
  if (columns.count <= 0 || endMs <= startMs) return [];
  const visibleStart = startMs + columns.start * TIMELINE_SLOT_MS;
  const visibleEnd = Math.min(endMs, visibleStart + columns.count * TIMELINE_SLOT_MS);
  return programmes.flatMap((programme) => {
    const start = Math.max(startMs, Date.parse(programme.start));
    const stop = Math.min(endMs, Date.parse(programme.stop));
    if (!(stop > start && stop > visibleStart && start < visibleEnd)) return [];
    return [{ programme, left: (start - startMs) / TIMELINE_SLOT_MS * TIMELINE_SLOT_WIDTH, width: (stop - start) / TIMELINE_SLOT_MS * TIMELINE_SLOT_WIDTH }];
  });
}
