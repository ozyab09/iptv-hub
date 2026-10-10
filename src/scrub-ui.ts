/**
 * Полоса прогресса плеера — DOM-слой поверх чистого scrub.ts (#369, паттерн #123).
 *
 * Локальная запись: позиция/длительность mm:ss и slider с pointer capture
 * (клик/drag выбирают позицию, seek — при pointerup, отмена возвращает
 * текущую; стрелки ±15 с, Home/End — края файла). Эфир и catchup: ход
 * передачи по EPG и «ещё N мин». Основная и мини-полоска синхронны.
 */
import { t, type Language, type TranslationKey, type TranslationParams } from "./i18n";
import { clock, mediaScrub, programmeProgress, scrubSeekTarget } from "./scrub";
import type { EpgProgramme } from "./types";

export interface ScrubUiNodes {
  scrub: HTMLElement;
  fill: HTMLElement;
  miniFill: HTMLElement;
  start: HTMLElement;
  end: HTMLElement;
  show: HTMLElement;
  timeLeft: HTMLElement;
}

export interface ScrubUiDeps {
  nodes: ScrubUiNodes;
  video: HTMLVideoElement;
  /** Играет локальная запись. */
  isRecording: () => boolean;
  /** Длительность записи из метаданных библиотеки (до loadedmetadata). */
  recordingDurationSec: () => number;
  seekBy: (seconds: number) => void;
  /** Передача, открытая из архива, или null. */
  archiveProgramme: () => EpgProgramme | null;
  /** Текущая передача эфира по EPG. */
  liveProgramme: () => EpgProgramme | null;
  /** URL канала — ключ перестройки программы под плеером. */
  channelUrl: () => string | null;
  scheduleKey: () => string;
  renderSchedule: () => void;
  language: () => Language;
  /** Пользователь трогает полосу: контролы не гаснут. */
  wake: () => void;
  /** Полная перерисовка плеера (кнопки, полоса, MediaSession). */
  refresh: () => void;
}

export interface ScrubUi {
  render(): void;
  /** Идёт перетаскивание ползунка. */
  isDragging(): boolean;
}

const SLIDER_ATTRS = ["role", "tabindex", "aria-label", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"];

export function createScrubUi(deps: ScrubUiDeps): ScrubUi {
  const { nodes, video } = deps;
  const tr = (key: TranslationKey, params: TranslationParams = {}): string => t(key, deps.language(), params);
  let drag: { pointerId: number; time: number } | null = null;

  /** Конечная длительность записи после metadata, иначе 0 (полоса не интерактивна). */
  function recordingDuration(): number {
    return deps.isRecording() && video.readyState > 0 && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration : 0;
  }

  function pointerTime(e: PointerEvent): number | null {
    const rect = nodes.scrub.getBoundingClientRect();
    return scrubSeekTarget(e.clientX, rect.left, rect.width, recordingDuration());
  }

  /** «ещё 58 мин», «ещё 1 ч 5 мин» — до конца передачи. */
  function timeLeft(ms: number): string {
    const min = Math.max(0, Math.round(ms / 60_000));
    if (min < 60) return tr("player.remainingMinutes", { minutes: min });
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? tr("player.remainingHours", { hours: h }) : tr("player.remainingBoth", { hours: h, minutes: m });
  }

  function setProgress(pct: string, start: string, end: string): void {
    nodes.fill.style.width = pct;
    nodes.miniFill.style.width = pct; // та же цифра: свёрнутый плеер не врёт
    nodes.start.textContent = start;
    nodes.end.textContent = end;
  }

  function render(): void {
    const scrub = nodes.scrub;
    const duration = recordingDuration();
    if (duration) {
      scrub.setAttribute("role", "slider");
      scrub.tabIndex = 0;
      scrub.setAttribute("aria-label", tr("record.position"));
      scrub.setAttribute("aria-valuemin", "0");
      scrub.setAttribute("aria-valuemax", String(duration));
    } else {
      const pointerId = drag?.pointerId;
      drag = null;
      if (pointerId !== undefined && scrub.hasPointerCapture(pointerId)) scrub.releasePointerCapture(pointerId);
      for (const attr of SLIDER_ATTRS) scrub.removeAttribute(attr);
    }

    if (deps.isRecording()) {
      const position = drag?.time ?? video.currentTime;
      const timeline = mediaScrub(position, video.duration, deps.recordingDurationSec());
      if (duration) {
        scrub.setAttribute("aria-valuenow", String(Math.max(0, Math.min(position, duration))));
        scrub.setAttribute("aria-valuetext", `${timeline.position} / ${timeline.duration}`);
      }
      setProgress(`${(timeline.progress * 100).toFixed(1)}%`, timeline.position, timeline.duration);
      nodes.show.textContent = "";
      nodes.timeLeft.textContent = "";
      if (deps.scheduleKey()) deps.renderSchedule();
      return;
    }

    const archive = deps.archiveProgramme();
    const prog = archive ?? deps.liveProgramme();
    if (!prog) {
      // Без EPG полоса пуста, но блок программы под плеером показывает
      // часовые слоты (#472) — строим один раз, пока ключ не выставлен.
      if (deps.channelUrl() && !deps.scheduleKey()) deps.renderSchedule();
      setProgress("0%", "", "");
      nodes.show.textContent = "";
      nodes.timeLeft.textContent = "";
      return;
    }
    const startMs = Date.parse(prog.start);
    const stopMs = Date.parse(prog.stop);
    const positionMs = archive ? startMs + video.currentTime * 1000 : Date.now();
    setProgress(
      `${(programmeProgress(positionMs, startMs, stopMs) * 100).toFixed(1)}%`,
      clock(startMs, deps.language()),
      clock(stopMs, deps.language()),
    );
    // Сменилась передача или канал — перестроить программу под плеером
    if (`${deps.channelUrl()}|${prog.start}` !== deps.scheduleKey()) deps.renderSchedule();
    // Название передачи — сверху кадра, «ещё N мин» — у конца полосы
    nodes.show.textContent = prog.title;
    nodes.timeLeft.textContent = timeLeft(stopMs - positionMs);
  }

  const scrub = nodes.scrub;
  scrub.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.isPrimary || drag) return;
    const time = pointerTime(e);
    if (time === null) return;
    e.preventDefault();
    e.stopPropagation();
    drag = { pointerId: e.pointerId, time };
    scrub.setPointerCapture(e.pointerId);
    scrub.focus();
    deps.wake();
    deps.refresh();
  });
  scrub.addEventListener("pointermove", (e) => {
    if (drag?.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const time = pointerTime(e);
    if (time !== null) drag.time = time;
    deps.wake();
    deps.refresh();
  });
  scrub.addEventListener("pointerup", (e) => {
    if (drag?.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const time = pointerTime(e);
    drag = null;
    scrub.releasePointerCapture(e.pointerId);
    if (time !== null) video.currentTime = time;
    deps.refresh();
  });
  for (const event of ["pointercancel", "lostpointercapture"] as const) {
    scrub.addEventListener(event, (e) => {
      if (drag?.pointerId !== e.pointerId) return;
      drag = null;
      deps.refresh();
    });
  }
  scrub.addEventListener("keydown", (e) => {
    const duration = recordingDuration();
    if (!duration || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Home") video.currentTime = 0;
    else if (e.key === "End") video.currentTime = duration;
    else deps.seekBy(e.key === "ArrowLeft" ? -15 : 15);
    deps.refresh();
  });

  return { render, isDragging: () => drag !== null };
}
