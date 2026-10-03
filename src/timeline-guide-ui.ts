import type { Channel, EpgProgramme } from "./types";
import type { DayWindow } from "./catchup";
import { buildCatchupUrl, canWatchPast } from "./catchup";
import { timelineWindow, timelineProgrammes, TIMELINE_ROW_HEIGHT, TIMELINE_SLOT_WIDTH, TIMELINE_SLOT_MS, TIMELINE_CHANNEL_WIDTH, TIMELINE_HEADER_HEIGHT } from "./timeline-guide";

export function createTimelineGuide(nodes: { scroll: HTMLElement; canvas: HTMLElement }, deps: {
  channels: () => readonly Channel[];
  programmes: (channel: Channel) => readonly EpgProgramme[];
  language: () => string;
  empty: () => string;
  channelLabel: () => string;
  play: (channel: Channel, archiveUrl?: string, programme?: EpgProgramme) => Promise<boolean>;
  close: () => void;
}) {
  let day: DayWindow | null = null;
  let frame = 0;

  function paint(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!day || nodes.scroll.hidden || !nodes.scroll.clientWidth) return;
    const channels = deps.channels();
    const columns = Math.ceil((day.endMs - day.startMs) / TIMELINE_SLOT_MS);
    const width = TIMELINE_CHANNEL_WIDTH + columns * TIMELINE_SLOT_WIDTH;
    const win = timelineWindow(channels.length, columns, nodes.scroll.scrollLeft,
      Math.max(0, nodes.scroll.scrollTop - TIMELINE_HEADER_HEIGHT),
      nodes.scroll.clientWidth - TIMELINE_CHANNEL_WIDTH, nodes.scroll.clientHeight - TIMELINE_HEADER_HEIGHT);
    const focused = document.activeElement as HTMLElement | null;
    const focusKey = nodes.canvas.contains(focused) ? focused?.dataset.cell : undefined;
    nodes.canvas.replaceChildren();
    nodes.canvas.style.width = `${width}px`;
    nodes.canvas.style.height = `${TIMELINE_HEADER_HEIGHT + channels.length * TIMELINE_ROW_HEIGHT}px`;
    const time = (ms: number) => new Date(ms).toLocaleTimeString(deps.language(), { hour: "2-digit", minute: "2-digit" });
    const header = document.createElement("div");
    header.className = "timeline-header";
    const corner = document.createElement("span");
    corner.className = "timeline-channel";
    corner.textContent = deps.channelLabel();
    header.append(corner);
    for (let i = win.columns.start; i < win.columns.start + win.columns.count; i++) {
      const slot = document.createElement("span");
      slot.className = "timeline-time";
      slot.style.left = `${TIMELINE_CHANNEL_WIDTH + i * TIMELINE_SLOT_WIDTH}px`;
      slot.textContent = time(day.startMs + i * TIMELINE_SLOT_MS);
      header.append(slot);
    }
    nodes.canvas.append(header);
    if (!channels.length) {
      const empty = document.createElement("div");
      empty.className = "timeline-empty muted";
      empty.textContent = deps.empty();
      nodes.canvas.append(empty);
      return;
    }
    const now = new Date();
    for (let i = win.rows.start; i < win.rows.start + win.rows.count; i++) {
      const channel = channels[i]!;
      const row = document.createElement("div");
      row.className = "timeline-row";
      row.dataset.url = channel.url;
      row.style.top = `${TIMELINE_HEADER_HEIGHT + i * TIMELINE_ROW_HEIGHT}px`;
      const label = document.createElement("span");
      label.className = "timeline-channel";
      label.textContent = channel.name;
      label.title = channel.name;
      row.append(label);
      for (const cell of timelineProgrammes(deps.programmes(channel), day.startMs, day.endMs, win.columns)) {
        const p = cell.programme;
        const live = Date.parse(p.start) <= now.getTime() && now.getTime() < Date.parse(p.stop);
        const past = Date.parse(p.stop) <= now.getTime();
        const cu = { days: channel.catchupDays, source: channel.catchupSource };
        const url = canWatchPast(cu, p, now) ? buildCatchupUrl(cu, p, now) : null;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `timeline-cell${live ? " now" : past ? " past" : ""}`;
        button.dataset.cell = JSON.stringify([channel.url, p.start]);
        button.style.left = `${TIMELINE_CHANNEL_WIDTH + cell.left}px`;
        button.style.width = `${cell.width}px`;
        button.disabled = !live && !url;
        button.title = `${channel.name} · ${time(Date.parse(p.start))}–${time(Date.parse(p.stop))} · ${p.title}`;
        button.setAttribute("aria-label", button.title);
        const caption = document.createElement("span");
        caption.textContent = p.title;
        caption.style.left = `${Math.max(8, Math.min(cell.width - 8, nodes.scroll.scrollLeft - cell.left + 8))}px`;
        button.append(caption);
        button.addEventListener("click", async () => {
          // Playback repeats visibility/PIN checks, including changes while the guide was open.
          const clickedAt = new Date();
          const current = Date.parse(p.start) <= clickedAt.getTime() && clickedAt.getTime() < Date.parse(p.stop);
          const archive = canWatchPast(cu, p, clickedAt) ? buildCatchupUrl(cu, p, clickedAt) : null;
          if ((current || archive) && await deps.play(channel, current ? undefined : archive!, current ? undefined : p)) deps.close();
        });
        row.append(button);
      }
      nodes.canvas.append(row);
    }
    if (focusKey) {
      Array.from(nodes.canvas.querySelectorAll<HTMLButtonElement>(".timeline-cell"))
        .find((button) => button.dataset.cell === focusKey)?.focus({ preventScroll: true });
    }
  }

  function refresh(): void {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  nodes.scroll.addEventListener("scroll", refresh, { passive: true });
  new ResizeObserver(refresh).observe(nodes.scroll);
  return {
    refresh,
    render(window: DayWindow): void {
      const changed = day?.startMs !== window.startMs;
      day = window;
      // Establish the scroll extent before centering the current time.
      paint();
      if (changed) {
        nodes.scroll.scrollTop = 0;
        const now = Date.now();
        nodes.scroll.scrollLeft = now >= window.startMs && now < window.endMs
          ? Math.max(0, (now - window.startMs) / TIMELINE_SLOT_MS * TIMELINE_SLOT_WIDTH - (nodes.scroll.clientWidth - TIMELINE_CHANNEL_WIDTH) / 2) : 0;
      }
      if (changed) paint();
    },
  };
}
