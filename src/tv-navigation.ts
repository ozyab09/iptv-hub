export type TvDirection = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
export interface FocusRect { left: number; top: number; width: number; height: number }

/** Ближайшая цель в направлении пульта; равные кандидаты сохраняют DOM-порядок. */
export function tvFocusTarget(current: FocusRect, candidates: readonly FocusRect[], direction: TvDirection): number | null {
  const x = current.left + current.width / 2;
  const y = current.top + current.height / 2;
  let best: number | null = null;
  let score = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const rect = candidates[i]!;
    const dx = rect.left + rect.width / 2 - x;
    const dy = rect.top + rect.height / 2 - y;
    const forward = direction === "ArrowLeft" ? -dx : direction === "ArrowRight" ? dx : direction === "ArrowUp" ? -dy : dy;
    if (forward <= 1) continue;
    const sideways = direction === "ArrowLeft" || direction === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    const distance = forward + sideways * 3;
    if (distance < score) { best = i; score = distance; }
  }
  return best;
}
