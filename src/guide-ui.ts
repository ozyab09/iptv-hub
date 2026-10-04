/**
 * Программа передач — DOM-слой (#368, паттерн #123): шторка «Программа»
 * со списком по дням, блок под плеером и карточка передачи (#363). Строку
 * передачи строит одна функция programmeRow() — и для шторки, и для блока
 * под плеером (контракт AGENTS). Сетка-таймлайн живёт в timeline-guide-ui.ts.
 *
 * Состояние плеера, запуск каналов и оверлеи приходят через create — модуль
 * не знает устройство main.ts и тестируется на фейках.
 */
import { buildCatchupUrl, canWatchPast, dayWindows, hourlyFallbackProgrammes, programmesInDay, type DayWindow } from "./catchup";
import { formatRange } from "./epg";
import { t, type Language, type TranslationKey, type TranslationParams } from "./i18n";
import { iconMarkup } from "./icons";
import type { OverlayName } from "./overlays";
import type { DownloadStatus } from "./programme-downloader";
import { programRowClass } from "./ui-classes";
import type { Channel, EpgProgramme } from "./types";

export interface GuideUiNodes {
  overlay: HTMLElement;
  title: HTMLElement;
  days: HTMLElement;
  list: HTMLElement;
  grid: HTMLElement;
  listMode: HTMLButtonElement;
  gridMode: HTMLButtonElement;
  schedule: HTMLElement;
  scheduleList: HTMLElement;
  card: {
    overlay: HTMLElement;
    title: HTMLElement;
    meta: HTMLElement;
    desc: HTMLElement;
    actions: HTMLElement;
    close: HTMLButtonElement;
  };
  downloadStatus: HTMLElement;
}

/** Скачивание передачи из архива (programme-downloader.ts, #359). */
export interface GuideDownloads {
  status(): DownloadStatus | null;
  start(channel: Channel, programme: EpgProgramme, url: string): void;
  cancel(): void;
}

export interface GuideUiDeps {
  nodes: GuideUiNodes;
  /** Текущий канал одиночного плеера. */
  channel: () => Channel | null;
  /** Передачи канала из загруженной EPG. */
  programmes: (channel: Channel | null) => EpgProgramme[];
  /** Передача, открытая из архива, — блок под плеером строится от неё. */
  archiveProgramme: () => EpgProgramme | null;
  language: () => Language;
  toast: (message: string) => void;
  playChannel: (channel: Channel, archiveUrl?: string, programme?: EpgProgramme) => Promise<boolean>;
  isCompact: () => boolean;
  /** Сетка-таймлайн для выбранного дня. */
  renderTimeline: (window: DayWindow) => void;
  openOverlay: (name: OverlayName) => void;
  closeOverlay: (name: OverlayName) => void;
  playlistId: () => string | null;
  planRecording: (channel: Channel, programme: EpgProgramme, playlistId: string) => void;
  reminderButton: (channel: Channel, programme: EpgProgramme, playlistId: string) => HTMLElement | null;
  downloads: GuideDownloads;
  setIcon: (el: HTMLElement, name: string) => void;
  /** Источник окна для document-уровневых слушателей (Escape карточки). */
  win?: Pick<Window, "addEventListener">;
}

export interface GuideUi {
  /** Открыть шторку на сегодняшнем дне. */
  open(): void;
  /** Перерисовать шторку (язык, режим, день). */
  render(): void;
  /** Перестроить блок «программа под плеером». */
  renderSchedule(): void;
  /** Ключ «канал|начало текущей передачи» последней перестройки блока. */
  scheduleKey(): string;
  setMode(grid: boolean): void;
  /** Открыт режим сетки. */
  isGrid(): boolean;
  /** Окно сузилось: сетка недоступна ниже 1024 px. */
  onResize(): void;
  /** Прогресс скачивания: кнопки программы и строка в «Записях». */
  refreshDownloads(): void;
}

type CatchupInfo = { days: number; source: string | null };

export function createGuideUi(deps: GuideUiDeps): GuideUi {
  const { nodes } = deps;
  const tr = (key: TranslationKey, params: TranslationParams = {}): string => t(key, deps.language(), params);
  let dayIdx = 0;
  let gridOn = false;
  let schedKey = "";

  /** Включить эфир или архив передачи: те же проверки, что у строки программы. */
  async function watchProgramme(c: Channel, p: EpgProgramme, now: Date, onPlayed: () => void): Promise<boolean> {
    const start = Date.parse(p.start);
    const stop = Date.parse(p.stop);
    if (start <= now.getTime() && now.getTime() < stop) {
      if (!await deps.playChannel(c)) return false;
      onPlayed();
      return true;
    }
    const url = buildCatchupUrl({ days: c.catchupDays, source: c.catchupSource }, p, now);
    if (!url) {
      deps.toast(tr("error.noArchive"));
      return false;
    }
    if (!await deps.playChannel(c, url, p)) return false;
    onPlayed();
    return true;
  }

  /** «Записать» и «Напомнить» для идущей и будущей передачи. */
  function futureActions(c: Channel, p: EpgProgramme): HTMLElement[] {
    const record = document.createElement("button");
    record.type = "button";
    record.className = "btn btn-sm schedule-programme";
    record.textContent = tr("schedule.title");
    const playlistId = deps.playlistId();
    record.addEventListener("click", () => { if (playlistId) deps.planRecording(c, p, playlistId); });
    const reminder = playlistId ? deps.reminderButton(c, p, playlistId) : null;
    return reminder ? [record, reminder] : [record];
  }

  function refreshDownloadButton(dl: HTMLButtonElement): void {
    const current = deps.downloads.status();
    const mine = current !== null && current.channelUrl === dl.dataset.downloadChannel && current.start === dl.dataset.downloadStart;
    dl.disabled = current !== null && !mine;
    dl.classList.toggle("downloading", mine);
    dl.textContent = mine ? tr("download.progress", { pct: Math.floor(current.progress * 100) }) : tr("download.title");
    dl.title = mine ? tr("download.cancel") : current ? tr("download.busy") : tr("download.title");
    dl.setAttribute("aria-label", dl.title);
  }

  function cancelDownload(): void {
    deps.downloads.cancel();
    deps.toast(tr("download.cancelled"));
  }

  /**
   * Кнопка скачивания передачи из архива. Пока идёт скачивание этой передачи,
   * кнопка показывает прогресс и отменяет его; другие кнопки ждут (#359).
   */
  function downloadButton(c: Channel, p: EpgProgramme, cu: CatchupInfo): HTMLButtonElement {
    const dl = document.createElement("button");
    dl.type = "button";
    dl.className = "btn btn-sm programme-download";
    dl.dataset.downloadChannel = c.url;
    dl.dataset.downloadStart = p.start;
    dl.addEventListener("click", () => {
      const current = deps.downloads.status();
      if (current) {
        if (current.channelUrl === c.url && current.start === p.start) cancelDownload();
        return;
      }
      const url = buildCatchupUrl(cu, p, new Date());
      if (!url) {
        deps.toast(tr("error.noArchive"));
        return;
      }
      deps.downloads.start(c, p, url);
    });
    refreshDownloadButton(dl);
    return dl;
  }

  /**
   * Карточка передачи (#363): название, время и статус, описание из EPG и
   * действия строки программы. Текст EPG вставляется только через textContent.
   */
  function openCard(c: Channel, p: EpgProgramme, onPlayed: () => void): void {
    const card = nodes.card;
    const now = new Date();
    const start = Date.parse(p.start);
    const stop = Date.parse(p.stop);
    const cu = { days: c.catchupDays, source: c.catchupSource };
    const isLive = start <= now.getTime() && now.getTime() < stop;
    const past = stop <= now.getTime();
    const watchable = isLive || canWatchPast(cu, p, now);
    card.title.textContent = p.title;
    const status = isLive ? tr("programme.statusNow") : past ? tr("programme.statusPast") : tr("programme.statusNext");
    card.meta.textContent = `${c.name} · ${formatRange(p, deps.language())} · ${status}`;
    card.desc.textContent = p.desc ?? "";
    card.desc.hidden = !p.desc;
    card.actions.textContent = "";
    if (watchable) {
      const watch = document.createElement("button");
      watch.type = "button";
      watch.className = "btn btn-sm btn-primary programme-watch";
      watch.textContent = isLive ? tr("guide.watchNow") : tr("guide.archive");
      watch.addEventListener("click", async () => {
        if (await watchProgramme(c, p, new Date(), onPlayed)) deps.closeOverlay("programme");
      });
      card.actions.append(watch);
    }
    if (past) {
      if (watchable && cu.source) card.actions.append(downloadButton(c, p, cu));
    } else {
      card.actions.append(...futureActions(c, p));
    }
    card.actions.hidden = card.actions.childElementCount === 0;
    deps.openOverlay("programme");
    card.close.focus();
  }

  function infoButton(c: Channel, p: EpgProgramme, onPlayed: () => void): HTMLButtonElement {
    const info = document.createElement("button");
    info.type = "button";
    info.className = "icon-btn programme-info";
    info.title = tr("programme.details");
    info.setAttribute("aria-label", `${tr("programme.details")}: ${p.title}`);
    deps.setIcon(info, "info");
    info.addEventListener("click", () => openCard(c, p, onPlayed));
    return info;
  }

  /**
   * Строка передачи — одна и для шторки с программой, и для блока под
   * плеером. Эфир включается, прошедшее с архивом — открывается из архива,
   * прошедшее без архива приглушено, будущее просто подписано.
   */
  function programmeRow(c: Channel, p: EpgProgramme, now: Date, onPlayed: () => void): HTMLElement {
    const cu = { days: c.catchupDays, source: c.catchupSource };
    const start = Date.parse(p.start);
    const stop = Date.parse(p.stop);
    const isLive = start <= now.getTime() && now.getTime() < stop;
    const watchable = isLive || canWatchPast(cu, p, now);
    const state = isLive ? "now" : stop <= now.getTime() ? "past" : "next";

    const row = document.createElement("button");
    // Приглушаем только прошедшее без архива: будущие передачи тоже нельзя
    // включить, но это нормальная программа, а не «недоступное».
    row.className = programRowClass(state) + (state === "past" && !watchable ? " dim" : "");
    // Нельзя включить — не кнопка для клавиатуры и мыши.
    row.disabled = !watchable;

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = formatRange(p, deps.language());
    const body = document.createElement("span");
    body.className = "prog-body";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = p.title;
    body.append(title);
    // Эфир и архив — плашками, а не символами в тексте: title приходит из EPG
    if (isLive) {
      const live = document.createElement("span");
      live.className = "live";
      live.textContent = tr("guide.live");
      body.append(live);
    } else if (state === "past" && watchable) {
      const arch = document.createElement("span");
      arch.className = "prog-arch";
      arch.innerHTML = iconMarkup("archive", "i-sm");
      arch.append(tr("guide.archive"));
      body.append(arch);
    }
    row.append(time, body);

    if (watchable) {
      row.title = isLive ? tr("guide.watchNow") : tr("guide.archiveTitle");
      row.addEventListener("click", () => void watchProgramme(c, p, now, onPlayed));
    } else if (state === "past") {
      row.title = cu.days > 0 ? tr("guide.outsideArchive") : tr("guide.noArchive");
    }
    // Описание из EPG — подсказкой на строке, полностью — в карточке (#363).
    if (p.desc) row.title = row.title ? `${row.title}. ${p.desc}` : p.desc;
    const wrapper = document.createElement("div");
    wrapper.className = "programme-recordable";
    wrapper.append(row, infoButton(c, p, onPlayed));
    if (stop <= now.getTime()) {
      // Скачивание доступной из архива передачи (#315, #359).
      if (watchable && cu.source) wrapper.append(downloadButton(c, p, cu));
      return wrapper;
    }
    wrapper.append(...futureActions(c, p));
    return wrapper;
  }

  function render(): void {
    const channel = deps.channel();
    nodes.title.textContent = gridOn ? tr("guide.gridTitle") : `${tr("guide.title")}${channel ? ` · ${channel.name}` : ""}`;
    nodes.overlay.querySelector(".guide")?.classList.toggle("timeline-mode", gridOn);
    nodes.listMode.textContent = tr("guide.list");
    nodes.gridMode.textContent = tr("guide.grid");
    nodes.listMode.setAttribute("aria-pressed", String(!gridOn));
    nodes.gridMode.setAttribute("aria-pressed", String(gridOn));
    nodes.list.hidden = gridOn;
    nodes.grid.hidden = !gridOn;
    const wins = dayWindows(new Date(), deps.language());
    nodes.days.textContent = "";
    wins.forEach((w, i) => {
      const b = document.createElement("button");
      b.textContent = w.label;
      b.className = i === dayIdx ? "chip on" : "chip";
      b.addEventListener("click", () => {
        dayIdx = i;
        render();
      });
      nodes.days.append(b);
    });

    nodes.list.textContent = "";
    const day = wins[dayIdx]!;
    if (gridOn) {
      deps.renderTimeline(day);
      return;
    }
    const now = new Date();
    let progs = programmesInDay(deps.programmes(channel), day);
    // Канал без телепрограммы, но с архивом: показываем часовые слоты «без
    // названия» на неделю назад (#314) — клик открывает catchup.
    if (channel && progs.length === 0 && channel.catchupDays > 0 && channel.catchupSource) {
      progs = programmesInDay(hourlyFallbackProgrammes(now), day);
    }
    if (!channel || progs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = tr("guide.noDay");
      nodes.list.append(empty);
      return;
    }
    for (const p of progs) {
      nodes.list.append(programmeRow(channel, p, now, () => (nodes.overlay.hidden = true)));
    }
  }

  /**
   * Программа под плеером: одна прошедшая (её можно открыть из архива), та,
   * что идёт, и три следующие. Полная — в шторке «Вся программа».
   */
  function renderSchedule(): void {
    const channel = deps.channel();
    const all = deps.programmes(channel);
    const archive = deps.archiveProgramme();
    const nowMs = archive ? Date.parse(archive.start) : Date.now();
    const i = all.findIndex((p) => Date.parse(p.start) <= nowMs && nowMs < Date.parse(p.stop));
    schedKey = channel && i >= 0 ? `${channel.url}|${all[i]!.start}` : "";
    nodes.scheduleList.textContent = "";
    nodes.schedule.hidden = i < 0;
    if (i < 0 || !channel) return;
    const now = new Date();
    for (const p of all.slice(Math.max(0, i - 1), i + 4)) {
      nodes.scheduleList.append(programmeRow(channel, p, now, () => undefined));
    }
  }

  function refreshDownloads(): void {
    for (const dl of [nodes.list, nodes.scheduleList, nodes.card.actions]
      .flatMap((root) => Array.from(root.querySelectorAll<HTMLButtonElement>(".programme-download")))) {
      refreshDownloadButton(dl);
    }
    const box = nodes.downloadStatus;
    const current = deps.downloads.status();
    box.hidden = current === null;
    box.textContent = "";
    if (!current) return;
    const label = document.createElement("span");
    label.className = "download-status-label ellipsis";
    label.textContent = tr("download.status", { title: current.title, channel: current.channelName });
    const bar = document.createElement("progress");
    bar.max = 100;
    bar.value = Math.floor(current.progress * 100);
    bar.setAttribute("aria-label", label.textContent);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-sm download-cancel";
    cancel.textContent = tr("download.cancel");
    cancel.addEventListener("click", cancelDownload);
    box.append(label, bar, cancel);
  }

  function setMode(grid: boolean): void {
    if (grid && deps.isCompact()) {
      deps.toast(tr("guide.mobile"));
      return;
    }
    gridOn = grid;
    render();
  }

  nodes.listMode.addEventListener("click", () => setMode(false));
  nodes.gridMode.addEventListener("click", () => setMode(true));
  nodes.card.close.addEventListener("click", () => deps.closeOverlay("programme"));
  nodes.card.overlay.addEventListener("click", (e) => {
    if (e.target === nodes.card.overlay) deps.closeOverlay("programme");
  });
  nodes.overlay.addEventListener("click", (e) => {
    if (e.target === nodes.overlay) deps.closeOverlay("guide");
  });
  const win = deps.win ?? window;
  // Escape закрывает карточку раньше гайда под ней: ловим в capture-фазе,
  // до обработчиков гайда и горячих клавиш плеера (#363).
  win.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || nodes.card.overlay.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    deps.closeOverlay("programme");
  }, true);
  win.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !nodes.overlay.hidden) deps.closeOverlay("guide");
  });

  return {
    open() {
      if (!deps.channel()) return;
      dayIdx = 0;
      deps.openOverlay("guide");
      render();
    },
    render,
    renderSchedule,
    scheduleKey: () => schedKey,
    setMode,
    isGrid: () => gridOn,
    onResize() {
      if (!gridOn || !deps.isCompact()) return;
      gridOn = false;
      if (!nodes.overlay.hidden) {
        deps.toast(tr("guide.mobile"));
        render();
      }
    },
    refreshDownloads,
  };
}
