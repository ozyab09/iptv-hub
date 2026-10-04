import { tvFocusTarget, type TvDirection } from "./tv-navigation";

const TARGETS = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex="0"]';

/** Навигация пультом и фокус после перерисовки; включается только в ТВ-режиме. */
export function createTvUi(options: {
  doc: Document; video: HTMLVideoElement; player: HTMLElement; enabled: boolean;
  moveChannel: (delta: number) => boolean; back: () => boolean;
  info: () => { channel: string; now: string; next: string };
}) {
  const { doc, video, player } = options;
  let enabled = false;
  let lastFocus: HTMLElement | null = null;
  let rowIndex: string | undefined;
  let lastScope: HTMLElement | null = null;
  const openers = new Map<HTMLElement, HTMLElement>();
  const info = doc.createElement("div");
  info.className = "tv-paused-info";
  info.hidden = true;
  info.setAttribute("role", "status");
  const title = doc.createElement("strong");
  const now = doc.createElement("p");
  const next = doc.createElement("p");
  info.append(title, now, next);
  video.parentElement!.append(info);

  const visible = (el: HTMLElement): boolean => el.isConnected && !el.closest("[hidden], [inert]") && el.getClientRects().length > 0;
  const targets = (root: ParentNode): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(TARGETS)]
    .filter(el => visible(el) && !el.matches(":disabled"));
  function scope(): HTMLElement | null {
    const overlays = [...doc.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"], .menu, [role="listbox"]')].filter(visible);
    return overlays.at(-1) ?? null;
  }
  function restore(): void {
    if (!enabled) return;
    const active = doc.activeElement as HTMLElement | null;
    const currentScope = scope();
    if (lastScope !== currentScope) {
      if (lastScope && !visible(lastScope)) {
        const opener = openers.get(lastScope);
        if (opener && visible(opener)) opener.focus();
        openers.delete(lastScope);
      }
      if (currentScope && !currentScope.contains(doc.activeElement)) {
        if (active && active !== doc.body) openers.set(currentScope, active);
        targets(currentScope)[0]?.focus();
      }
      lastScope = currentScope;
    }
    const focused = doc.activeElement as HTMLElement | null;
    if (focused && focused !== doc.body && visible(focused) && (!currentScope || currentScope.contains(focused))) return;
    const replacement = rowIndex === undefined ? null : doc.querySelector<HTMLElement>(`[data-result-index="${rowIndex}"] .channel-hit, [data-result-index="${rowIndex}"][tabindex="0"]`);
    const sameId = lastFocus?.id ? doc.getElementById(lastFocus.id) : null;
    const list = targets(currentScope ?? doc);
    const candidate = currentScope ? list[0] : sameId && visible(sameId) ? sameId : replacement;
    const fallback = currentScope ? list[0] : list.find(el => el.matches(".channel-hit")) ?? list.find(el => el.closest("#side-nav")) ?? list[0];
    (candidate && visible(candidate) ? candidate : fallback)?.focus();
  }
  function refresh(): void {
    info.hidden = !enabled || player.hidden || !video.paused;
    if (info.hidden) return;
    const programme = options.info();
    if (title.textContent !== programme.channel) title.textContent = programme.channel;
    if (now.textContent !== programme.now) now.textContent = programme.now;
    if (next.textContent !== programme.next) next.textContent = programme.next;
  }
  function enable(): void {
    if (enabled) return;
    enabled = true;
    doc.documentElement.dataset.tv = "true";
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open"] });
    restore(); refresh();
  }
  const observer = new MutationObserver(restore);
  doc.addEventListener("iptv-tv", enable);
  doc.addEventListener("focusin", event => {
    if (!enabled || !(event.target instanceof HTMLElement)) return;
    lastFocus = event.target;
    rowIndex = lastFocus.closest<HTMLElement>("[data-result-index]")?.dataset.resultIndex ?? rowIndex;
  });
  doc.addEventListener("keydown", event => {
    if (!enabled || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape") {
      if (options.back()) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    const active = doc.activeElement as HTMLElement | null;
    if (!active) return;
    const modal = scope();
    if (event.key === "Tab" && modal) {
      const list = targets(modal);
      const index = list.indexOf(active);
      list[(index + (event.shiftKey ? -1 : 1) + list.length) % list.length]?.focus();
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (event.key === "Enter" && !event.isTrusted && active.matches('button, a[href], input[type="checkbox"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); active.click(); return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (active.matches("select")) { event.stopImmediatePropagation(); return; }
    if (active.matches('input[type="range"]') && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      if (!event.isTrusted) {
        const input = active as HTMLInputElement;
        input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + (event.key === "ArrowLeft" ? -1 : 1) * (Number(input.step) || 1))));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        event.preventDefault(); event.stopImmediatePropagation();
      }
      return;
    }
    if (active.matches('textarea, input:not([type="checkbox"]):not([type="range"]), [contenteditable="true"]')) {
      if (active.id !== "search" || event.key !== "ArrowDown") { event.stopImmediatePropagation(); return; }
      // Обычный обработчик поиска применяет debounce и переводит фокус в список.
      return;
    }
    const direction = event.key as TvDirection;
    event.preventDefault(); event.stopImmediatePropagation();
    if ((direction === "ArrowDown" || direction === "ArrowUp") && options.moveChannel(direction === "ArrowDown" ? 1 : -1)) return;
    const candidates = targets(scope() ?? doc).filter(el => el !== active);
    const index = tvFocusTarget(active.getBoundingClientRect(), candidates.map(el => el.getBoundingClientRect()), direction);
    if (index !== null) candidates[index]!.focus();
    else restore();
  }, true);
  for (const event of ["pause", "play", "loadeddata", "ended"]) video.addEventListener(event, refresh);
  if (options.enabled || doc.documentElement.dataset.tv === "true") enable();
  return { refresh };
}
