import type { Channel } from "./types";

export interface MirrorState { urls: readonly string[]; index: number }

/** Основной URL первый; повторные адреса не создают циклов fallback. */
export function createMirrorState(channel: Pick<Channel, "url" | "mirrors">): MirrorState {
  return { urls: [...new Set([channel.url, ...(channel.mirrors ?? [])].filter((url) => url.trim() !== ""))], index: 0 };
}

/** Каждое зеркало пробуется один раз; после последнего нужен ручной повтор. */
export function nextMirror(state: MirrorState): MirrorState | null {
  const index = state.index + 1;
  return index < state.urls.length ? { urls: state.urls, index } : null;
}
