import "./style.css";
import { installDebugLog } from "./debug-log";
import { iconMarkup, spriteMarkup } from "./icons";
import {
  channelsForView,
  channelsWord,
  emptyMessage,
  groupDigits,
  parseView,
  showsCategories,
  showsChannelList,
  VIEWS,
  type View,
} from "./views";
import {
  channelRowClass,
  chipClass,
  menuItemClass,
  programRowClass,
  qualityBadgeClass,
  starClass,
} from "./ui-classes";
import { createRecordingSink } from "./recording-sink";
import { createSegmentSession } from "./segment-recorder";
import {
  isMixedContent,
} from "./config";
import {
  activePlaylist,
  addPlaylist,
  loadPlaylists,
  removePlaylist,
  savePlaylists,
  updatePlaylist,
  upsertByUrl,
  favoritesKey,
  type PlaylistsState,
} from "./playlists";
import {
  applyFavorites,
  isFavorite,
  toggleFavorite,
} from "./favorites";
import { parseM3U } from "./m3u";
import { formatRange, getNowNext, loadEpg } from "./epg";
import {
  computeWindow,
  spacerHeight,
} from "./virtual-list";
import { clock, isBehindLive, programmeProgress } from "./scrub";
import { classifySwipe, isDoubleTap, tapSide } from "./gestures";
import { type OverlayName, popOverlay, pushOverlay, topOverlay } from "./overlays";
import { neighborIndex, Player, seekBy } from "./player";
import {
  applyTheme,
  clearTheme,
  resolveTheme,
  saveTheme,
  themeButtonLabel,
  themeChoice,
  toggleTheme,
  type Theme,
  type ThemeChoice,
} from "./theme";
import {
  buildBackup,
  parseBackup,
  pushRecent,
  recentsKey,
} from "./backup";
import {
  canRecord,
  createRecordingSession,
  recordingFileName,
  type RecorderLike,
  type RecordingSource,
} from "./recorder";
import {
  buildCatchupUrl,
  canWatchPast,
  dayWindows,
  programmesInDay,
  type DayWindow,
} from "./catchup";
import {
  formatBitrate,
  formatResolution,
  formatStatus,
  levelLabel,
  qualityButtonLabel,
  sortLevelsDesc,
  tierName,
  trackLabel,
} from "./quality";
import type { Channel, EpgProgramme, PlaylistSnapshot } from "./types";
import {
  shouldShowHttpNotice,
  markHttpNoticeShown,
} from "./http-notice";
import {
  addNotification,
  loadNotifications,
  markAllRead,
  nextId,
  saveNotifications,
  unreadCount,
} from "./notifications";
import {
  checkSummary,
  countProgrammes,
  diffSnapshots,
  loadInterval,
  loadLastCheck,
  saveInterval,
  saveLastCheck,
  shouldCheck,
  type RefreshInterval,
} from "./refresh";
import { LatestGuard } from "./latest";
import {
  probeStream,
  probeVerdict,
  corsChecklist,
  httpChecklist,
} from "./stream-diagnostics";

// Ставится первым, чтобы поймать и самые ранние сообщения.
installDebugLog(window.location.search);

// Спрайт иконок: один раз на страницу, до первого рендера.
document.body.insertAdjacentHTML("afterbegin", spriteMarkup());

/** Заменить содержимое кнопки иконкой (иконки живут в src/icons.ts). */
function setIcon(el: HTMLElement, name: string): void {
  el.innerHTML = iconMarkup(name);
}

/** Иконка звука по текущей громкости. */
function refreshMuteIcon(): void {
  setIcon(btnMute, player.getVolume() === 0 ? "mute" : "volume");
}

// ---------- DOM ----------
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} не найден`);
  return el as T;
};

const appEl = $("app");
const setupScreen = $("setup-screen");
const playerScreen = $("player-screen");
const setupPlaylist = $<HTMLInputElement>("setup-playlist");
const setupEpg = $<HTMLInputElement>("setup-epg");
const setupLoad = $<HTMLButtonElement>("setup-load");
const setupName = $<HTMLInputElement>("setup-name");
const plList = $("pl-list");
const plSwitch = $("pl-switch");
const plSwitchBtn = $<HTMLButtonElement>("pl-switch-btn");
const plSwitchMenu = $("pl-switch-menu");
const addForm = $<HTMLFormElement>("add-form");
const btnAddPl = $<HTMLButtonElement>("btn-add-pl");
const themeSeg = $("theme-seg");
const refreshSeg = $("refresh-seg");
const btnRefreshNow = $<HTMLButtonElement>("btn-refresh-now");
const setupError = $("setup-error");
const searchInput = $<HTMLInputElement>("search");
const categoriesNav = $("categories");
const channelList = $("channel-list");
const emptyState = $("empty-state");
const epgNow = $("epg-now");
const playerBar = $("player-bar");
const videoEl = $<HTMLVideoElement>("video");
const videoStage = $("video-stage");
const liveBadge = $("live-badge");
const scrubFill = $("scrub-fill");
const progStart = $("prog-start");
const progEnd = $("prog-end");
const btnLive = $<HTMLButtonElement>("btn-live");
const miniProgFill = $("mini-prog-fill");
const continueBlock = $("continue-block");
const continueRow = $("continue-row");
const nowTitle = $("now-title");
const nowCategory = $("now-category");
const nowShow = $("now-show");
const nowTimeLeft = $("now-time-left");
const btnCollapseList = $<HTMLButtonElement>("btn-collapse-list");
const toastEl = $("toast");
const notifBell = $<HTMLButtonElement>("notif-bell");
const notifBadge = $("notif-badge");
const notifPanel = $("notif-panel");
const notifList = $("notif-list");
const notifClear = $<HTMLButtonElement>("notif-clear");
const btnClosePlayer = $<HTMLButtonElement>("btn-close-player");
const btnExpand = $<HTMLButtonElement>("btn-expand");
const btnFullscreen = $<HTMLButtonElement>("btn-fullscreen");
const btnRetry = $<HTMLButtonElement>("btn-retry");
const btnExport = $<HTMLButtonElement>("btn-export");
const btnImport = $<HTMLButtonElement>("btn-import");
const importFile = $<HTMLInputElement>("import-file");
const sideNav = $("side-nav");
const tabbar = $("tabbar");
const viewTitle = $("view-title");
const viewCount = $("view-count");
const catLabel = $("cat-label");
const plSwitchName = $("pl-switch-name");
const plSwitchCount = $("pl-switch-count");
const catPicker = $("cat-picker");
const btnCategories = $<HTMLButtonElement>("btn-categories");
const catMenu = $("cat-menu");
const btnPause = $<HTMLButtonElement>("btn-pause");
const btnPrev = $<HTMLButtonElement>("btn-prev");
const btnNext = $<HTMLButtonElement>("btn-next");
const btnSeekBack = $<HTMLButtonElement>("btn-seek-back");
const btnSeekFwd = $<HTMLButtonElement>("btn-seek-fwd");
const btnMute = $<HTMLButtonElement>("btn-mute");
const volumeSlider = $<HTMLInputElement>("volume-slider");
const btnPip = $<HTMLButtonElement>("btn-pip");
const qualityWrap = $("quality-wrap");
const qualityBtn = $<HTMLButtonElement>("quality-btn");
const qualityMenu = $("quality-menu");
const audioWrap = $("audio-wrap");
const audioBtn = $<HTMLButtonElement>("audio-btn");
const audioMenu = $("audio-menu");
const subtitleWrap = $("subtitle-wrap");
const subtitleBtn = $<HTMLButtonElement>("subtitle-btn");
const subtitleMenu = $("subtitle-menu");
const playerStatus = $("player-status");
const btnGuide = $<HTMLButtonElement>("btn-guide");
const guideOverlay = $("guide-overlay");
const guideTitle = $("guide-title");
const guideDays = $("guide-days");
const guideList = $("guide-list");
const nowSchedule = $("now-schedule");
const schedList = $("sched-list");
const btnFullGuide = $<HTMLButtonElement>("btn-full-guide");
const guideClose = $<HTMLButtonElement>("guide-close");
const btnRec = $<HTMLButtonElement>("btn-rec");
const nowFav = $<HTMLButtonElement>("now-fav");
const btnTheme = $<HTMLButtonElement>("btn-theme");

// ---------- Состояние ----------
let snapshot: PlaylistSnapshot | null = null;
let epg: Map<string, import("./types").EpgProgramme[]> | null = null;
let activeCategory: string | null = null;
let plState: PlaylistsState = loadPlaylists(
  typeof localStorage !== "undefined" ? localStorage : null,
);
let favKey: string | null = null; // favoritesKey(id) активного плейлиста (legacy)
void favKey;
let favorites = new Set<string>();
const VIEW_KEY = "iptv-hub.view.v1";
let activeView: View = parseView(
  typeof localStorage !== "undefined" ? localStorage.getItem(VIEW_KEY) : null,
);
/** Плоский список каналов в текущем рендере — для prev/next в плеере. */
let visibleChannels: Channel[] = [];
/**
 * Высота строки канала. Должна совпадать с `.row.channel-card` в style.css:
 * виртуализация позиционирует строки арифметикой, и расхождение тут уводит
 * прокрутку. Тест сверяет оба значения.
 */
const CHANNEL_ROW_HEIGHT = 72;
/** Список каналов — одна колонка строк, как требует дизайн-система. */
const CHANNEL_COLUMNS = 1;

/** Недавно просмотренные (url → имя берём из snapshot при рендере). */
let recents: string[] = [];
// Диагностика потока (#116): один раз на канал при фатальной ошибке.
let diagnosticsFor: string | null = null;
async function diagnoseStreamFailure(): Promise<void> {
  const url = player.currentStreamUrl;
  if (!url || diagnosticsFor === url) return;
  diagnosticsFor = url;
  try {
    const r = await probeStream(url, (u, init) => fetch(u, init));
    const verdict = probeVerdict(r);
    const detail =
      r.kind === "blocked" ? corsChecklist() : r.kind === "http" ? httpChecklist(r.status) : "";
    pushNotification(`${verdict}${detail ? `. ${detail}` : ""}`);
    showToast(verdict);
  } catch {
    // диагностика не должна усугублять сбой — молча
  }
}

const player = new Player(
  videoEl,
  showToast,
  () => {
    refreshQualityUi();
    refreshPlayerStatus();
    btnRetry.hidden = true; // поток ожил — retry не нужен
  },
  () => {
    btnRetry.hidden = false; // фатальная ошибка — показываем retry
    void diagnoseStreamFailure();
  },
);

// ---------- UI helpers ----------
// Токен показа: таймер скрытия гасит тост, только если поверх не показали
// новый. Иначе короткий тост («Запись остановлена») уносил с собой кнопку
// скачивания, которая должна жить 15с (issue #58).
let toastToken = 0;

function showToast(msg: string): void {
  const token = ++toastToken;
  toastEl.textContent = msg;
  toastEl.hidden = false;
  window.setTimeout(() => {
    if (toastToken === token) toastEl.hidden = true;
  }, 3500);
}

/** Тост с кнопкой действия (для Firefox-скачивания нужен новый user gesture). */
function showToastAction(
  msg: string,
  actionLabel: string,
  action: () => void,
  durationMs = 15_000,
): void {
  const token = ++toastToken;
  toastEl.textContent = "";
  const span = document.createElement("span");
  span.textContent = msg;
  const btn = document.createElement("button");
  btn.className = "toast-action";
  btn.textContent = actionLabel;
  btn.addEventListener("click", () => {
    action();
    toastEl.hidden = true;
  });
  toastEl.append(span, btn);
  toastEl.hidden = false;
  window.setTimeout(() => {
    if (toastToken === token) toastEl.hidden = true;
  }, durationMs);
}

// ---------- Центр уведомлений (#98) ----------
/** История уведомлений; хранится в localStorage, переживает перезагрузку. */
let notifications = loadNotifications(
  typeof localStorage !== "undefined" ? localStorage : null,
);

/** Свежие уведомления поднимают бейдж на колокольчике. */
function renderNotifications(): void {
  const unread = unreadCount(notifications);
  notifBadge.hidden = unread === 0;
  notifBadge.textContent = unread > 9 ? "9+" : String(unread);
  notifList.textContent = "";
  if (notifications.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notif-empty";
    empty.textContent = "Пока ничего не случилось";
    notifList.append(empty);
    return;
  }
  for (const item of notifications) {
    const row = document.createElement("div");
    row.className = item.read ? "notif-item" : "notif-item unread";
    const time = document.createElement("span");
    time.className = "n-time num";
    time.textContent = new Date(item.at).toLocaleString("ru", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const text = document.createElement("span");
    text.textContent = item.text; // текст плейлиста ненадёжен — только textContent
    row.append(time, text);
    notifList.append(row);
  }
}

/** Положить уведомление в колокольчик (данные + бейдж). */
function pushNotification(message: string): void {
  notifications = addNotification(
    notifications,
    nextId(notifications),
    message,
    Date.now(),
  );
  saveNotifications(notifications, typeof localStorage !== "undefined" ? localStorage : null);
  renderNotifications();
}

notifBell.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = notifPanel.hidden;
  notifPanel.hidden = !willOpen;
  notifBell.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    overlayStack = pushOverlay(overlayStack, "notifications");
    history.pushState({ overlay: "notifications" }, "");
    // Открыл панель — прочитал всё, что в ней видно
    notifications = markAllRead(notifications);
    saveNotifications(notifications, typeof localStorage !== "undefined" ? localStorage : null);
    renderNotifications();
  }
});

notifClear.addEventListener("click", () => {
  notifications = [];
  saveNotifications(notifications, typeof localStorage !== "undefined" ? localStorage : null);
  renderNotifications();
});

document.addEventListener("click", (e) => {
  if (notifPanel.hidden) return;
  if (!notifBell.contains(e.target as Node) && !notifPanel.contains(e.target as Node)) {
    closeOverlay("notifications");
  }
});

renderNotifications();

function showSetup(message?: string): void {
  setView("settings", false);
  if (message) {
    setupError.textContent = message;
    setupError.hidden = false;
  }
}

/** Вернуться из настроек в последний список каналов. */
function showPlayer(): void {
  setView(activeView === "settings" ? "channels" : activeView);
}

/**
 * Экран настроек в двух видах. Пока плейлистов нет, это первый запуск:
 * приветствие и одно поле со ссылкой. Потом — настройки, где форма
 * добавления открывается кнопкой «Добавить плейлист».
 */
function renderSettingsMode(): void {
  const firstRun = plState.items.length === 0;
  setupScreen.classList.toggle("first-run", firstRun);
  // Без плейлиста разделы, поиск и таб-бар вести некуда — прячем их
  appEl.classList.toggle("no-playlist", firstRun);
  setupLoad.textContent = firstRun ? "Открыть каналы" : "Добавить и открыть";
  if (firstRun) addForm.hidden = false;
}

function setAddFormOpen(open: boolean): void {
  addForm.hidden = !open;
  btnAddPl.setAttribute("aria-expanded", String(open));
  if (open) setupPlaylist.focus();
}

btnAddPl.addEventListener("click", () => setAddFormOpen(addForm.hasAttribute("hidden")));

// ---------- Разделы ----------
/** Кнопка раздела: одна и та же модель для таб-бара и сайдбара. */
function navButton(view: (typeof VIEWS)[number], cls: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = activeView === view.id ? `${cls} on` : cls;
  b.setAttribute("aria-current", activeView === view.id ? "page" : "false");
  b.innerHTML = iconMarkup(view.icon);
  const label = document.createElement("span");
  label.textContent = view.label;
  b.append(label);
  b.addEventListener("click", () => setView(view.id));
  return b;
}

function renderNav(): void {
  tabbar.textContent = "";
  sideNav.textContent = "";
  for (const v of VIEWS) {
    tabbar.append(navButton(v, "tab"));
    sideNav.append(navButton(v, "side-item"));
  }
  viewTitle.textContent = VIEWS.find((v) => v.id === activeView)?.label ?? "";
}

/**
 * Переключить раздел: и экран, и видимость фильтров, и список.
 *
 * `persist: false` — для вынужденных переходов (плейлист не настроен, значит
 * показываем настройки). Такой переход не должен затирать раздел, который
 * пользователь выбрал сам, иначе выбор теряется при каждом пустом старте.
 */
function setView(view: View, persist = true): void {
  activeView = view;
  if (persist) {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* приватный режим */
    }
  }
  const settings = view === "settings";
  setupScreen.hidden = !settings;
  playerScreen.hidden = settings;
  if (settings) {
    setupError.hidden = true;
    renderPlaylistManager();
    renderPlaylistSwitcher();
    renderSettingsMode();
    if (plState.items.length > 0 && !setupError.textContent) setAddFormOpen(false);
    renderThemeSeg();
    renderRefreshSeg();
  }
  categoriesNav.hidden = !showsCategories(view);
  catLabel.hidden = !showsCategories(view);
  catPicker.hidden = !showsCategories(view);
  // Категория — фильтр раздела «Каналы»; в избранном и недавних она
  // прятала бы половину списка без видимой причины.
  if (!showsCategories(view)) activeCategory = null;
  renderNav();
  if (showsChannelList(view) && snapshot) {
    renderCategories();
    renderChannels();
  }
}

// ---------- Рендер категорий ----------
function renderCategories(): void {
  if (!snapshot) return;
  categoriesNav.textContent = "";
  const mk = (label: string, value: string | null, count: number) => {
    const b = document.createElement("button");
    b.textContent = label;
    const n = document.createElement("span");
    n.className = "count";
    n.textContent = String(count);
    b.append(n);
    b.className = chipClass(activeCategory === value);
    b.addEventListener("click", () => {
      activeCategory = value;
      renderCategories();
      renderChannels();
    });
    return b;
  };
  const entries: Array<[string, string | null, number]> = [
    ["Все", null, snapshot.channels.length],
    ...snapshot.categories.map(
      (g) =>
        [g, g, snapshot!.channels.filter((c) => c.group === g).length] as [
          string,
          string,
          number,
        ],
    ),
  ];
  categoriesNav.append(...entries.map(([l, v, n]) => mk(l, v, n)));

  // Тот же список пунктами меню — для режима просмотра, где чипов нет.
  catMenu.textContent = "";
  for (const [label, value, count] of entries) {
    const item = document.createElement("button");
    item.className = menuItemClass(activeCategory === value);
    item.setAttribute("role", "option");
    item.textContent = `${label} (${count})`;
    item.addEventListener("click", () => {
      activeCategory = value;
      catMenu.hidden = true;
      btnCategories.setAttribute("aria-expanded", "false");
      renderCategories();
      renderChannels();
    });
    catMenu.append(item);
  }
  const current = entries.find(([, v]) => v === activeCategory);
  btnCategories.textContent = current ? current[0] : "Все";
}

btnCategories.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = catMenu.hidden;
  catMenu.hidden = !willOpen;
  btnCategories.setAttribute("aria-expanded", String(willOpen));
});
document.addEventListener("click", (e) => {
  if (!catMenu.hidden && !catPicker.contains(e.target as Node)) {
    catMenu.hidden = true;
    btnCategories.setAttribute("aria-expanded", "false");
  }
});

// ---------- Рендер каналов (виртуализированный) ----------
/** Карточки держим живыми только в видимом окне; остальное — спейсер. */
let virtualSpacer: HTMLDivElement | null = null;
let virtualInner: HTMLDivElement | null = null;

function ensureVirtualShell(): void {
  if (virtualInner) return;
  virtualSpacer = document.createElement("div");
  virtualSpacer.className = "virtual-spacer";
  virtualInner = document.createElement("div");
  virtualInner.className = "virtual-inner";
  virtualSpacer.append(virtualInner);
  channelList.append(virtualSpacer);
  channelList.addEventListener("scroll", () => {
    renderVirtualWindow();
  });
}

function renderVirtualWindow(): void {
  if (!virtualInner || !virtualSpacer) return;
  const vh = channelList.clientHeight || 600;
  const win = computeWindow(
    channelList.scrollTop,
    vh,
    visibleChannels.length,
    CHANNEL_ROW_HEIGHT,
    undefined,
    CHANNEL_COLUMNS,
  );
  virtualSpacer.style.height = `${spacerHeight(visibleChannels.length, CHANNEL_ROW_HEIGHT, CHANNEL_COLUMNS)}px`;
  virtualInner.style.transform = `translateY(${win.offset}px)`;
  virtualInner.textContent = "";
  const first = win.start * CHANNEL_COLUMNS;
  const last = Math.min(
    visibleChannels.length,
    first + win.count * CHANNEL_COLUMNS,
  );
  for (let i = first; i < last; i++) {
    const c = visibleChannels[i];
    if (c) virtualInner.append(renderChannelCard(c));
  }
}

// Поворот экрана / resize меняет ширину контейнера (число колонок) и питч —
// пересчитываем окно, иначе спейсер остаётся со старой высотой и карточки
// наезжают друг на друга (issue #62).
window.addEventListener("resize", () => {
  if (playerScreen.hidden) return;
  renderVirtualWindow();
});

function renderChannels(): void {
  if (!snapshot) return;
  const q = searchInput.value.trim().toLowerCase();
  const inView = channelsForView(activeView, snapshot.channels, favorites, recents);
  const list = inView.filter((c) => {
    if (activeCategory && c.group !== activeCategory) return false;
    if (!q) return true;
    return (
      c.normalizedName.includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q)
    );
  });
  // «Недавние» уже в порядке просмотра — пересортировка сделала бы раздел
  // бессмысленным; в остальных избранное поднимается наверх.
  const sorted =
    activeView === "recents" ? list : applyFavorites(list, favorites, false);
  visibleChannels = sorted;
  viewCount.textContent = groupDigits(sorted.length);
  emptyState.textContent = emptyMessage(activeView, q !== "");
  emptyState.hidden = sorted.length > 0;
  ensureVirtualShell();
  // при смене фильтра сбрасываем прокрутку, чтобы окно пересчиталось с нуля
  renderContinue();
  channelList.scrollTop = 0;
  renderVirtualWindow();
}

function renderChannelCard(c: Channel): HTMLElement {
  const card = document.createElement("button");
  card.className = channelRowClass(lastPlayed?.url === c.url);
  card.setAttribute("role", "listitem");

  // Плитка логотипа есть всегда: без неё строки прыгают по высоте, а с
  // монограммой канал опознаётся и когда картинка не загрузилась.
  const logo = document.createElement("span");
  logo.className = "logo sm";
  logo.title = c.name; // подсказка, когда список свёрнут до логотипов
  logo.textContent = c.name.trim().slice(0, 2).toUpperCase();
  if (c.logo) {
    const img = document.createElement("img");
    img.src = c.logo;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    logo.textContent = "";
    logo.append(img);
  }
  card.append(logo);

  const meta = document.createElement("span");
  meta.className = "meta";
  const line = document.createElement("span");
  line.className = "line";

  const name = document.createElement("span");
  name.className = "t-strong ellipsis";
  name.textContent = c.name;
  name.title = c.url; // ссылка на поток при наведении
  line.append(name);

  if (c.quality) {
    const q = document.createElement("span");
    q.className = qualityBadgeClass(c.quality);
    q.textContent = c.quality;
    line.append(q);
  }
  meta.append(line);

  // Что идёт сейчас, сколько прошло и (на широком экране) что дальше:
  // канал выбирают по передаче, а не по названию.
  let nextText = "";
  if (epg) {
    const { now, next } = getNowNext(epg, c, snapshot!);
    if (now) {
      const e = document.createElement("span");
      e.className = "row-now ellipsis";
      const t = document.createElement("span");
      t.className = "num muted";
      t.textContent = clock(Date.parse(now.start));
      e.append(t, ` ${now.title}`);
      meta.append(e);

      const bar = document.createElement("span");
      bar.className = "prog";
      const fill = document.createElement("span");
      fill.style.width = `${(programmeProgress(Date.now(), Date.parse(now.start), Date.parse(now.stop)) * 100).toFixed(1)}%`;
      bar.append(fill);
      meta.append(bar);
    }
    if (next) nextText = `${clock(Date.parse(next.start))}  ${next.title}`;
  }
  card.append(meta);

  const nextEl = document.createElement("span");
  nextEl.className = "row-next ellipsis muted num";
  nextEl.textContent = nextText;
  card.append(nextEl);

  const star = document.createElement("button");
  const fav = isFavorite(favorites, c);
  star.className = starClass(fav);
  star.title = fav ? "Убрать из избранного" : "В избранное";
  star.setAttribute("aria-label", star.title);
  setIcon(star, fav ? "star-on" : "star");
  star.addEventListener("click", (ev) => {
    ev.stopPropagation(); // не запускать воспроизведение
    favorites = toggleFavorite(favorites, c);
    if (plState.activeId) saveFavoritesFor(plState.activeId);
    refreshNowFav();
    renderCategories();
    renderChannels();
  });
  card.append(star);

  card.addEventListener("click", () => playChannel(c));
  return card;
}

// ---------- Плеер ----------
function playChannel(c: Channel): void {
  // Смена канала во время записи: сохраняем записанный кусок старого канала.
  if (isRecordingNow() && lastPlayed && lastPlayed.url !== c.url) {
    stopRecordingNow();
    showToast("Запись остановлена: канал переключён");
  }
  lastPlayed = c;
  // recents: дедап по url, максимум RECENTS_MAX, хранение per-плейлист
  recents = pushRecent(recents, c.url);
  if (plState.activeId) {
    try {
      localStorage.setItem(
        recentsKey(plState.activeId),
        JSON.stringify(recents),
      );
    } catch { /* приватный режим */ }
    // Раздел «Недавние» показывает этот список — обновляем, если он открыт.
    if (activeView === "recents") renderChannels();
  }
  nowTitle.textContent = c.name;
  nowTitle.title = c.url; // ссылка на поток текущего канала
  nowCategory.textContent = c.group;
  playerBar.hidden = false;
  setWatching(true);
  refreshNowFav();
  setIcon(btnPause, "pause"); // после play() обычно идёт воспроизведение
  playerStatus.textContent = "";
  btnRetry.hidden = true; // новый канал — сбрасываем retry-статус
  const refused = player.play(c);
  if (refused) {
    showToast(refused);
    return;
  }
  // уровни/дорожки приходят асинхронно после парсинга манифеста
  refreshQualityUi();
  renderChannels(); // подсветка активного
}

/** Переключить на соседний канал в текущем видимом списке (с зацикливанием). */
function playNeighbor(step: 1 | -1): void {
  if (visibleChannels.length === 0) return;
  const cur = visibleChannels.findIndex((c) => c === lastPlayed);
  const from = cur >= 0 ? cur : step === 1 ? -1 : 0;
  const idx = neighborIndex(from, visibleChannels.length, step);
  if (idx !== null) playChannel(visibleChannels[idx]!);
}

let lastPlayed: Channel | null = null;

btnClosePlayer.addEventListener("click", () => {
  if (isRecordingNow()) {
    stopRecordingNow(); // закрытие плеера — тоже сохраняем записанное
    showToast("Запись остановлена: плеер закрыт");
  }
  if (document.fullscreenElement) void document.exitFullscreen();
  player.stop();
  playerBar.hidden = true;
  setWatching(false);
  lastPlayed = null;
  renderChannels();
});

btnPause.addEventListener("click", () => {
  player.togglePause();
});
videoEl.addEventListener("play", () => setIcon(btnPause, "pause"));
videoEl.addEventListener("pause", () => setIcon(btnPause, "play"));
videoEl.addEventListener("loadedmetadata", () => {
  // нативный playback: разрешение становится известно здесь
  if (videoEl.videoWidth) {
    playerStatus.textContent = formatStatus({
      resolution: formatResolution(videoEl.videoWidth, videoEl.videoHeight),
      bitrate: "—",
    });
  }
  refreshPlayerStatus();
});

btnPrev.addEventListener("click", () => playNeighbor(-1));
btnNext.addEventListener("click", () => playNeighbor(1));

// Перемотка ±15 сек (на live заблокирована — skipTarget вернёт null)
btnSeekBack.addEventListener("click", () => seekBy(videoEl, -15));
btnSeekFwd.addEventListener("click", () => seekBy(videoEl, 15));

// Ручной перезапуск потока после фатальной ошибки
btnRetry.addEventListener("click", () => {
  btnRetry.hidden = true;
  player.retry();
  showToast("Перезапуск потока…");
});

btnMute.addEventListener("click", () => {
  player.toggleMute();
  refreshMuteIcon();
  volumeSlider.value = String(Math.round(player.getVolume() * 100));
});
volumeSlider.addEventListener("input", () => {
  player.setVolume(Number(volumeSlider.value) / 100);
  refreshMuteIcon();
});

btnPip.addEventListener("click", () => void player.togglePip());

// Клик по самому видео — пауза/продолжить (стандарт видеоплееров)
videoEl.addEventListener("click", () => {
  if (playerBar.hidden) return;
  player.togglePause();
});

// Звезда избранного в плеер-баре (синхронизирована со списком)
function refreshNowFav(): void {
  if (!lastPlayed) return;
  const fav = isFavorite(favorites, lastPlayed);
  setIcon(nowFav, fav ? "star-on" : "star");
  nowFav.classList.toggle("active", fav);
  nowFav.title = fav ? "Убрать из избранного" : "В избранное";
}
nowFav.addEventListener("click", () => {
  if (!lastPlayed) return;
  favorites = toggleFavorite(favorites, lastPlayed);
  if (plState.activeId) saveFavoritesFor(plState.activeId);
  refreshNowFav();
  renderChannels();
});

// Горячие клавиши (когда фокус не в инпуте)
window.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA";

  // «/» — поиск. Проверяем code, а не key: в русской раскладке на этой
  // клавише другой символ, а палец жмёт ту же кнопку.
  if (e.code === "Slash" && !typing && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  if (playerBar.hidden || typing) return;
  switch (e.key) {
    case " ":
      e.preventDefault();
      player.togglePause();
      break;
    case "ArrowRight":
      playNeighbor(1);
      break;
    case "ArrowLeft":
      playNeighbor(-1);
      break;
    case "ArrowUp":
      e.preventDefault();
      volumeSlider.value = String(
        Math.min(100, Number(volumeSlider.value) + 10),
      );
      player.setVolume(Number(volumeSlider.value) / 100);
      refreshMuteIcon();
      break;
    case "ArrowDown":
      e.preventDefault();
      volumeSlider.value = String(
        Math.max(0, Number(volumeSlider.value) - 10),
      );
      player.setVolume(Number(volumeSlider.value) / 100);
      refreshMuteIcon();
      break;
    case "Escape":
      if (playerBar.classList.contains("open")) {
        e.preventDefault();
        togglePlayerPage(false);
      }
      break;
    case "g":
    case "п": // ru-раскладка
      e.preventDefault();
      if (guideOverlay.hidden) openGuide();
      else guideOverlay.hidden = true;
      break;
    case "c":
    case "с": // ru-раскладка
      // На широком экране C сворачивает и разворачивает список рядом с
      // плеером. На узком — возврат к списку: сворачиваем страницу плеера,
      // иначе прокрутка к списку под ней ничего бы не показала.
      e.preventDefault();
      if (!isCompact()) {
        setListCollapsed(!appEl.classList.contains("list-collapsed"));
        break;
      }
      togglePlayerPage(false);
      channelList.scrollIntoView({ block: "nearest" });
      (channelList.querySelector("button") as HTMLElement | null)?.focus();
      break;
    case "m":
    case "ь": // ru-раскладка
      btnMute.click();
      break;
    case "j":
    case "о": // ru-раскладка
      btnSeekBack.click();
      break;
    case "l":
    case "д": // ru-раскладка
      btnSeekFwd.click();
      break;
    case "f":
    case "а": // ru-раскладка
      btnFullscreen.click();
      break;
  }
});

// ---- Качество / дорожки / статус-бар (живут, пока играет hls-поток) ----

/** Перестроить селект качества + дорожки после смены канала. */
function refreshQualityUi(): void {
  const hls = player.getHls();
  qualityMenu.textContent = "";
  audioMenu.textContent = "";
  subtitleMenu.textContent = "";

  if (!hls) {
    // нативный playback (Safari/iOS, mp4): выбор качества/дорожек недоступен
    qualityBtn.disabled = true;
    qualityBtn.textContent = "Auto";
    qualityMenu.hidden = true;
    audioWrap.hidden = true;
    subtitleWrap.hidden = true;
    playerStatus.textContent =
      videoEl.videoWidth
        ? formatStatus({
            resolution: formatResolution(videoEl.videoWidth, videoEl.videoHeight),
            bitrate: "—",
          })
        : "—";
    return;
  }

  qualityBtn.disabled = false;
  const levels = sortLevelsDesc(
    hls.levels.map((lv, i) => ({ ...lv, index: i })),
  );
  const currentLv = hls.levels[hls.currentLevel] ?? null;
  qualityBtn.textContent = qualityButtonLabel(hls.autoLevelEnabled, currentLv);
  const mkItem = (label: string, levelIndex: number, active: boolean) => {
    const b = document.createElement("button");
    b.className = menuItemClass(active);
    b.setAttribute("role", "option");
    b.textContent = label;
    b.addEventListener("click", () => {
      player.setLevel(levelIndex);
      closeQualityMenu();
    });
    return b;
  };
  qualityMenu.append(
    mkItem(
      hls.autoLevelEnabled
        ? `Auto · ${currentLv?.height ? tierName(currentLv.height) : "…"}`
        : "Auto",
      -1,
      hls.autoLevelEnabled,
    ),
    ...levels.map((l) =>
      mkItem(
        levelLabel(l),
        l.index ?? -1,
        !hls.autoLevelEnabled && hls.currentLevel === l.index,
      ),
    ),
  );

  const audioTracks = hls.audioTracks ?? [];
  audioWrap.hidden = audioTracks.length < 2;
  if (audioTracks.length >= 2) {
    audioMenu.textContent = "";
    audioTracks.forEach((t, i) => {
      const b = document.createElement("button");
      b.className =
        menuItemClass(i === hls.audioTrack);
      b.textContent = trackLabel(t, i);
      b.addEventListener("click", () => {
        player.setAudioTrack(i);
        audioMenu.hidden = true;
      });
      audioMenu.append(b);
    });
    audioBtn.title = `Аудиодорожка: ${trackLabel(audioTracks[hls.audioTrack] ?? {}, hls.audioTrack)}`;
  }

  const subTracks = hls.subtitleTracks ?? [];
  subtitleWrap.hidden = subTracks.length === 0;
  if (subTracks.length > 0) {
    subtitleMenu.textContent = "";
    const off = document.createElement("button");
    off.className =
      menuItemClass(hls.subtitleTrack === -1);
    off.textContent = "Выключены";
    off.addEventListener("click", () => {
      player.setSubtitleTrack(-1);
      subtitleMenu.hidden = true;
    });
    subtitleMenu.append(off);
    subTracks.forEach((t, i) => {
      const b = document.createElement("button");
      b.className =
        menuItemClass(i === hls.subtitleTrack);
      b.textContent = trackLabel(t, i);
      b.addEventListener("click", () => {
        player.setSubtitleTrack(i);
        subtitleMenu.hidden = true;
      });
      subtitleMenu.append(b);
    });
  }
}

/** Обновить статус-бар: разрешение + текущий битрейт (при смене уровня). */
function refreshPlayerStatus(): void {
  // Плашка «Эфир» — для живого потока: у него нет конечной длительности.
  const live = !Number.isFinite(videoEl.duration) || videoEl.duration === 0;
  liveBadge.hidden = !live || videoEl.readyState === 0;
  refreshScrub();

  const hls = player.getHls();
  if (!hls) return;
  const lv = hls.levels[hls.currentLevel];
  playerStatus.textContent = formatStatus({
    resolution: formatResolution(videoEl.videoWidth, videoEl.videoHeight),
    bitrate: lv ? formatBitrate(lv.bitrate) : "—",
  });
}

// ---- Меню качества (кнопка + выпадающий список) ----
function closeQualityMenu(): void {
  qualityMenu.hidden = true;
  qualityBtn.setAttribute("aria-expanded", "false");
}

qualityBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = qualityMenu.hidden;
  qualityMenu.hidden = !willOpen;
  qualityBtn.setAttribute("aria-expanded", String(willOpen));
});
document.addEventListener("click", (e) => {
  if (!qualityMenu.hidden && !qualityWrap.contains(e.target as Node)) {
    closeQualityMenu();
  }
});

// меню дорожек — тот же паттерн, что у качества
document.addEventListener("click", (e) => {
  if (!audioMenu.hidden && !audioWrap.contains(e.target as Node)) audioMenu.hidden = true;
  if (!subtitleMenu.hidden && !subtitleWrap.contains(e.target as Node)) subtitleMenu.hidden = true;
});
audioBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  audioMenu.hidden = !audioMenu.hidden;
});
subtitleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  subtitleMenu.hidden = !subtitleMenu.hidden;
});

/** Остановить запись, если идёт (с сохранением). Вызывается при смене плейлиста. */
function stopIfRecording(): void {
  if (isRecordingNow()) {
    stopRecordingNow();
    showToast("Запись остановлена: плейлист переключён");
  }
}

// ---- Запись эфира (MediaRecorder поверх captureStream) ----
// Жизненный цикл живёт в recorder.ts (createRecordingSession) — здесь только
// браузерная обвязка: источник кадров, адаптер MediaRecorder, сохранение файла.
let recordRaf = 0;
/**
 * Способы получить стрим, от лучшего к самому неприхотливому. Сорвавшаяся
 * запись сдвигает указатель: на мобильном Firefox захват элемента отдаёт обе
 * дорожки, но энкодер через секунду падает с UnknownError, и единственный
 * способ это пережить — попробовать следующий вариант.
 */
const SOURCE_STRATEGIES = ["element", "canvas-audio", "canvas-silent"] as const;
let sourceStrategy = 0;
/** Каким путём пошла запись — показывается тостом, консоли на телефоне нет. */
let recordPathNote = "";

/** captureStream у <video> нестандартен: в Gecko он зовётся mozCaptureStream. */
type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

/**
 * Источник записи: сначала прямой захват с <video> — он отдаёт видео и звук
 * одним стримом, без канваса и rAF. Не всякий браузер умеет это поверх MSE,
 * поэтому при неудаче откатываемся на отрисовку кадров в канвас (без звука).
 */
function createRecordSource(): RecordingSource {
  if (SOURCE_STRATEGIES[sourceStrategy] === "element") {
    const direct = captureFromVideo();
    if (direct) return direct;
    sourceStrategy = 1; // захвата элемента нет — дальше только канвас
  }
  return captureFromCanvas(SOURCE_STRATEGIES[sourceStrategy] === "canvas-audio");
}

/**
 * Прямой захват элемента. null — браузер его не умеет для текущего источника.
 *
 * mozCaptureStream — не запасной путь, а устаревший алиас того же API, поэтому
 * берётся ровно один из них: вторая попытка на том же элементе трогала бы уже
 * созданный захват.
 */
function captureFromVideo(): RecordingSource | null {
  const v = videoEl as CapturableVideo;
  const capture = v.captureStream ?? v.mozCaptureStream;
  if (typeof capture !== "function") return null;
  try {
    const stream = capture.call(v);
    const [track] = stream.getVideoTracks();
    if (!track || track.readyState !== "live") {
      stream.getTracks().forEach((t) => t.stop());
      console.debug("[iptv-hub] rec: захват с <video> отдал мёртвую дорожку");
      return null;
    }
    const audio = stream.getAudioTracks().length;
    console.debug(`[iptv-hub] rec: захват с <video>, video=1 audio=${audio}`);
    recordPathNote = audio > 0 ? "Запись со звуком" : "Запись без звука";
    return { stream };
  } catch (e) {
    console.debug("[iptv-hub] rec: захват с <video> не удался:", e);
    return null;
  }
}

// AudioContext и узел источника создаются один раз на весь сеанс:
// createMediaElementSource можно вызвать на элементе только однажды, повторный
// вызов бросает InvalidStateError.
let audioCtx: AudioContext | null = null;
let audioSourceNode: MediaElementAudioSourceNode | null = null;

/**
 * Аудиодорожка текущего видео через Web Audio — так звук добывается там, где
 * захват элемента не работает (мобильный Firefox).
 *
 * null означает, что звука не будет: нет Web Audio, либо поток кросс-доменный
 * без CORS — тогда граф по стандарту отдаёт тишину. Для HLS через hls.js это
 * не проблема: источник элемента — свой blob: от MediaSource.
 */
function captureAudioTrack(): { track: MediaStreamTrack; release: () => void } | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      // Звук обязательно возвращается в вывод: без этого соединения элемент
      // замолчит, потому что его аудио уходит в граф целиком.
      audioSourceNode = audioCtx.createMediaElementSource(videoEl);
      audioSourceNode.connect(audioCtx.destination);
    }
    if (!audioSourceNode) return null;
    void audioCtx.resume(); // клик по ⏺ — валидный user gesture
    const dest = audioCtx.createMediaStreamDestination();
    audioSourceNode.connect(dest);
    const [track] = dest.stream.getAudioTracks();
    if (!track) {
      audioSourceNode.disconnect(dest);
      return null;
    }
    return {
      track,
      release: () => audioSourceNode?.disconnect(dest),
    };
  } catch (e) {
    console.debug("[iptv-hub] rec: Web Audio недоступен:", e);
    return null;
  }
}

/**
 * Фолбэк: картинка рисуется на канвас, звук добирается через Web Audio.
 * Работает там, где захват элемента невозможен, ценой rAF-цикла — то есть
 * записи нужна вкладка на переднем плане.
 */
/**
 * Есть ли на канвасе непустые пиксели. null — прочитать не удалось
 * (кросс-доменное видео портит канвас, и getImageData бросает).
 */
function canvasHasFrames(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): boolean | null {
  const w = Math.min(64, canvas.width);
  const h = Math.min(64, canvas.height);
  try {
    const px = ctx.getImageData((canvas.width - w) >> 1, (canvas.height - h) >> 1, w, h).data;
    let max = 0;
    for (let i = 0; i < px.length; i += 4) {
      max = Math.max(max, px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0);
    }
    console.debug(`[iptv-hub] rec: проба канваса max=${max}`);
    return max > 0;
  } catch (e) {
    console.debug("[iptv-hub] rec: канвас испорчен CORS, проба невозможна:", e);
    return null;
  }
}

function captureFromCanvas(withAudio: boolean): RecordingSource {
  console.debug(`[iptv-hub] rec: запасной путь — канвас, звук=${withAudio}`);
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth || 1280;
  canvas.height = videoEl.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d недоступен");
  let disposed = false;
  // requestAnimationFrame вместо setInterval: Firefox/Zen троттлят setInterval
  // в фоне до 1/с, и captureStream(25) перестаёт получать кадры.
  const drawFrame = (): void => {
    if (disposed) return;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    recordRaf = window.requestAnimationFrame(drawFrame);
  };
  drawFrame();
  let stream: MediaStream;
  try {
    stream = canvas.captureStream(25);
  } catch (e) {
    // иначе rAF-цикл остался бы крутиться без владельца
    disposed = true;
    window.cancelAnimationFrame(recordRaf);
    recordRaf = 0;
    throw e;
  }
  // Firefox на Android держит декодированное видео в аппаратной поверхности,
  // недоступной канвасу: drawImage молча рисует черноту, звук при этом идёт.
  // Без проверки пользователь записал бы получасовой чёрный экран.
  // Две пробы с разносом: одиночный тёмный кадр не должен считаться отказом.
  let blackStrikes = 0;
  const probeCanvas = (): void => {
    if (disposed) return;
    const lit = canvasHasFrames(canvas, ctx);
    if (lit === null || lit) return; // прочитать не смогли или кадры есть
    if (++blackStrikes < 2) {
      window.setTimeout(probeCanvas, 1500);
      return;
    }
    console.warn("[iptv-hub] rec: канвас не получает кадров — записывать нечего");
    recSession.stop(false);
    showToast(
      "Этот браузер не отдаёт кадры видео — записать нельзя. На Android попробуйте Chrome.",
    );
  };
  window.setTimeout(probeCanvas, 1000);

  const audio = withAudio ? captureAudioTrack() : null;
  if (audio) stream.addTrack(audio.track);
  recordPathNote = audio
    ? "Запись со звуком (запасной путь)"
    : "Запись без звука (запасной путь)";
  const [track] = stream.getVideoTracks();
  console.debug(
    `[iptv-hub] rec: track=${track?.label ?? "?"} readyState=${track?.readyState} audio=${audio ? 1 : 0}`,
  );
  return {
    stream,
    dispose: () => {
      disposed = true;
      window.cancelAnimationFrame(recordRaf);
      recordRaf = 0;
      audio?.release();
    },
  };
}

/** Обёртка реального MediaRecorder в контракт сессии. */
function createRecorderAdapter(stream: MediaStream, mimeType: string): RecorderLike {
  const rec = new MediaRecorder(stream, { mimeType });
  const adapter: RecorderLike = {
    getState: () => rec.state,
    start: (timesliceMs) => rec.start(timesliceMs),
    stop: () => {
      console.debug(`[iptv-hub] rec: stop из state=${rec.state}`);
      rec.stop();
    },
    ondataavailable: null,
    onstop: null,
    onerror: null,
  };
  rec.ondataavailable = (e) => {
    console.debug(`[iptv-hub] rec: chunk ${e.data.size}B (${rec.state})`);
    adapter.ondataavailable?.({ data: e.data });
  };
  rec.onstop = () => adapter.onstop?.();
  rec.onerror = (ev) => adapter.onerror?.((ev as unknown as { error?: Error }).error);
  return adapter;
}

/**
 * Отдать записанный файл. Классическое сохранение: a[download] с готовым
 * именем, без prompt. Если браузер настроен «спрашивать, куда сохранять» —
 * покажет свой диалог (это его настройка, см. README), файл НЕ теряется.
 */
function saveRecording(blob: Blob, chunkCount: number, mimeType: string): void {
  console.debug(
    `[iptv-hub] onstop: ${blob.size} байт, mime=${mimeType}, chunks=${chunkCount}`,
  );
  if (blob.size === 0) {
    showToast(
      `Запись пустая (${chunkCount} чанков, 0 байт) — вероятно, видео было скрыто/свёрнуто. Не сворачивайте вкладку при записи. Консоль F12: [iptv-hub]`,
    );
    return;
  }
  offerDownload(blob, recordingFileName(lastPlayed?.name ?? "recording"));
}

/** Отдать готовый файл пользователю — общее для обоих способов записи. */
function offerDownload(blob: Blob, name: string): void {
  // Для записи из OPFS это File с диска: createObjectURL отдаёт его потоком,
  // содержимое в память не вытягивается.
  const url = URL.createObjectURL(blob);

  // Самопроверка: браузер читает то, что сам только что записал. Отличает
  // битый файл от целого, который не по зубам системному плееру.
  const probe = document.createElement("video");
  probe.preload = "metadata";
  probe.onloadedmetadata = () => {
    console.debug(
      `[iptv-hub] файл: ${probe.videoWidth}x${probe.videoHeight}, длительность=${probe.duration}`,
    );
  };
  probe.onerror = () => console.debug("[iptv-hub] файл: браузер не смог его прочитать");
  probe.src = url;

  // Firefox: a.click() из асинхронного обработчика (вне user gesture) молча
  // глотается — повторные клики не помогают. Надёжный путь — клик по кнопке
  // из тоста: это новый user gesture, скачивание гарантировано.
  const download = (): void => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.append(a);
    a.click();
    a.remove();
  };
  download();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  // Кнопка в тосте живёт 15с: если авто-скачивание не сработало (Firefox),
  // явный клик = свежий жест → загрузка начнётся наверняка.
  showToastAction("Автоскачивание не началось?", `Скачать ${name}`, download, 15_000);
}

/**
 * Режим просмотра: канал играет. На широком экране по нему раскладка
 * перестраивается в «список слева, плеер справа».
 */
function setWatching(on: boolean): void {
  appEl.classList.toggle("watch", on);
}

// ---------- Кнопка «назад» и стек оверлеев (FR-6) ----------
// Открытие оверлея кладёт запись в history: системный «назад» (свайп на
// Android, кнопка мыши) закрывает верхний оверлей, а не приложение.
// Логика стека — чистый модуль overlays.ts, здесь только DOM-синхронизация.
let overlayStack: string[] = [];
let historyGuard = false; // не зеркалить собственные history.back()

/** Показать/скрыть DOM-узел оверлея по имени. */
function applyOverlay(name: OverlayName, on: boolean): void {
  if (name === "guide") guideOverlay.hidden = !on;
  else if (name === "notifications") {
    notifPanel.hidden = !on;
    notifBell.setAttribute("aria-expanded", String(on));
  } else if (name === "manager") {
    setView(on ? "settings" : "channels");
  } else if (name === "quality") {
    qualityMenu.hidden = !on;
  }
}

/** Открыть оверлей: DOM + запись в history. */
function openOverlay(name: OverlayName): void {
  if (topOverlay(overlayStack) === name) return;
  applyOverlay(name, true);
  overlayStack = pushOverlay(overlayStack, name);
  history.pushState({ overlay: name }, "");
}

/** Закрыть оверлей из UI (крестик, Escape, клик мимо): DOM + history.back(). */
function closeOverlay(name: OverlayName): void {
  if (topOverlay(overlayStack) !== name) {
    // Закрыли не верхний (или стек рассинхронизировался) — чистим тихо.
    applyOverlay(name, false);
    overlayStack = popOverlay(overlayStack, name);
    return;
  }
  applyOverlay(name, false);
  overlayStack = popOverlay(overlayStack, name);
  historyGuard = true;
  history.back();
}

/** Системный «назад»: закрываем верхний оверлей без повторного history.back(). */
window.addEventListener("popstate", () => {
  if (historyGuard) {
    historyGuard = false;
    return;
  }
  const top = topOverlay(overlayStack);
  if (top === null) return; // оверлеев нет — стандартное поведение (закрытие PWA)
  applyOverlay(top, false);
  overlayStack = popOverlay(overlayStack, top);
});

/**
 * Свернуть список каналов рядом с плеером в колонку логотипов: плеер
 * забирает освободившееся место. Выбор запоминается — кто смотрит без
 * списка, тот и в следующий раз хочет без него.
 */
const LIST_COLLAPSED_KEY = "iptv-hub.list-collapsed.v1";

function setListCollapsed(on: boolean): void {
  appEl.classList.toggle("list-collapsed", on);
  btnCollapseList.setAttribute("aria-expanded", String(!on));
  btnCollapseList.title = on ? "Развернуть список (C)" : "Свернуть список (C)";
  btnCollapseList.setAttribute(
    "aria-label",
    on ? "Развернуть список каналов" : "Свернуть список каналов",
  );
  btnCollapseList
    .querySelector("use")
    ?.setAttribute("href", on ? "#i-panel-open" : "#i-panel-close");
  try {
    localStorage.setItem(LIST_COLLAPSED_KEY, on ? "1" : "0");
  } catch {
    // приватный режим — живём без памяти
  }
}

btnCollapseList.addEventListener("click", () =>
  setListCollapsed(!appEl.classList.contains("list-collapsed")),
);
try {
  if (localStorage.getItem(LIST_COLLAPSED_KEY) === "1") setListCollapsed(true);
} catch {
  // storage недоступен — список развёрнут
}

/** Вид кнопки ⏺ — общий для обоих способов записи. */
function renderRecButton(active: boolean): void {
  btnRec.classList.toggle("recording", active);
  btnRec.title = active
    ? "Остановить запись и сохранить файл"
    : "Записать эфир в файл";
}

const recSession = createRecordingSession({
  createSource: createRecordSource,
  createRecorder: createRecorderAdapter,
  onSave: saveRecording,
  onNotify: showToast,
  onState: (state) => {
    console.debug(`[iptv-hub] rec: state=${state}`);
    renderRecButton(state === "recording");
  },
  onSourceLost: () => {
    // Запись сорвалась — переходим на следующий способ захвата и пробуем
    // снова. Указатель только растёт, так что цикла быть не может.
    if (sourceStrategy < SOURCE_STRATEGIES.length - 1) {
      sourceStrategy++;
      console.debug(`[iptv-hub] rec: переключаюсь на ${SOURCE_STRATEGIES[sourceStrategy]}`);
      showToast("Запись сорвалась — пробую другой способ захвата");
      startRecording();
      return;
    }
    showToast("Записать не удалось ни одним способом — см. ?debug=1");
  },
});

/**
 * Запись готовыми сегментами — основной путь для HLS. Складывает то, что
 * hls.js уже скачал: без перекодирования, без канваса и MediaRecorder,
 * а значит работает и там, где те бессильны (Firefox для Android).
 */
const segSession = createSegmentSession({
  createSink: createRecordingSink,
  onNotify: showToast,
  onState: (state) => {
    console.debug(`[iptv-hub] seg: state=${state}`);
    renderRecButton(state === "recording");
    // Ловим и остановку самой сессией — по потолку размера или сбою хранилища.
    if (state === "idle") restoreLevelAfterRecording();
  },
  onSave: (blob, result) => {
    console.debug(
      `[iptv-hub] seg: ${result.bytes} байт, сегментов=${result.segments}, ` +
        `хранилище=${result.sink}, .${result.ext}`,
    );
    offerDownload(
      blob,
      recordingFileName(lastPlayed?.name ?? "recording", new Date(), result.ext),
    );
  },
});

// Подписка переживает смену канала: Player вешает обработчик на каждый новый
// hls-инстанс. init-сегменты копятся всегда — для fMP4 без них файл нечитаем.
player.setFragmentListener((payload, isInit) => segSession.feed(payload, isInit));

/**
 * Уровень качества, в который надо вернуться после записи (-1 = Auto).
 * null — ничего не фиксировали.
 */
let levelBeforeRecording: number | null = null;

/**
 * Зафиксировать текущее качество на время записи. В режиме Auto плеер
 * переключает уровень по обстановке, и в склейке сегментов оказались бы куски
 * разного разрешения — многие плееры показывают такое криво.
 */
function pinLevelForRecording(): void {
  const hls = player.getHls();
  if (!hls || !hls.autoLevelEnabled) return;
  const level = hls.currentLevel;
  if (level < 0) return;
  levelBeforeRecording = -1; // вернём обратно в Auto
  player.setLevel(level);
  console.debug(`[iptv-hub] seg: качество зафиксировано на уровне ${level}`);
}

function restoreLevelAfterRecording(): void {
  if (levelBeforeRecording === null) return;
  player.setLevel(levelBeforeRecording);
  levelBeforeRecording = null;
  console.debug("[iptv-hub] seg: качество возвращено в Auto");
}

/** Идёт ли запись любым из способов. */
function isRecordingNow(): boolean {
  return segSession.isRecording() || recSession.isRecording();
}

/** Остановить запись любым из способов, сохранив записанное. */
function stopRecordingNow(): void {
  if (segSession.isRecording()) {
    void segSession.stop(true);
    return;
  }
  if (recSession.isRecording()) recSession.stop(true);
}

function startRecording(): void {
  // HLS пишем сегментами; перекодирование остаётся для остального
  // (нативное воспроизведение, прямые mp4).
  if (player.getHls()) {
    pinLevelForRecording();
    void segSession.start().then(() => {
      // старт мог не состояться (не создалось хранилище) — не держим качество
      if (!segSession.isRecording()) restoreLevelAfterRecording();
    });
    return;
  }
  if (!canRecord()) {
    showToast("Запись не поддерживается этим браузером");
    return;
  }
  console.debug(
    `[iptv-hub] rec: видео ${videoEl.videoWidth}x${videoEl.videoHeight}, ` +
      `на экране=${videoEl.offsetWidth}x${videoEl.offsetHeight}, paused=${videoEl.paused}`,
  );
  recordPathNote = "";
  recSession.start();
  if (recSession.isRecording() && recordPathNote) showToast(recordPathNote);
}

// Единый toggle: старт из idle, стоп+сохранение из recording.
// (Раньше здесь жили два обработчика — addEventListener + onclick — и оба
// срабатывали на один клик, показывая ложный тост «Запись уже идёт».)
btnRec.addEventListener("click", () => {
  console.debug(
    `[iptv-hub] клик по ⏺, seg=${segSession.state()} rec=${recSession.state()}`,
  );
  if (isRecordingNow()) {
    stopRecordingNow();
    return;
  }
  if (!lastPlayed) return;
  startRecording();
});

// ---- Гайд (программа передач) + catchup ----
let guideDayIdx = 0;

function openGuide(): void {
  if (!lastPlayed) return;
  guideTitle.textContent = `Программа · ${lastPlayed.name}`;
  guideDayIdx = 0;
  openOverlay("guide");
  renderGuide();
}

function renderGuide(): void {
  if (!lastPlayed) return;
  const wins = dayWindows();
  guideDays.textContent = "";
  wins.forEach((w, i) => {
    const b = document.createElement("button");
    b.textContent = w.label;
    b.className = i === guideDayIdx ? "chip on" : "chip";
    b.addEventListener("click", () => {
      guideDayIdx = i;
      renderGuide();
    });
    guideDays.append(b);
  });

  guideList.textContent = "";
  const window: DayWindow = wins[guideDayIdx]!;
  const progs = epg ? programmesInDay(channelProgrammes(), window) : [];
  if (progs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Нет данных на этот день";
    guideList.append(empty);
    return;
  }

  const now = new Date();
  for (const p of progs) {
    guideList.append(programmeRow(p, now, () => (guideOverlay.hidden = true)));
  }
}

/**
 * Строка передачи — одна и для шторки с программой, и для блока под
 * плеером. Эфир включается, прошедшее с архивом — открывается из архива,
 * прошедшее без архива приглушено, будущее просто подписано.
 */
function programmeRow(p: EpgProgramme, now: Date, onPlayed: () => void): HTMLButtonElement {
  const c = lastPlayed!;
  const cu = { days: c.catchupDays, source: c.catchupSource };
  const start = Date.parse(p.start);
  const stop = Date.parse(p.stop);
  const isLive = start <= now.getTime() && now.getTime() < stop;
  const watchable = isLive || canWatchPast(cu, p, now);
  const state = isLive ? "now" : stop <= now.getTime() ? "past" : "next";

  const row = document.createElement("button");
  // Приглушаем только прошедшее без архива: будущие передачи тоже нельзя
  // включить, но это нормальная программа, а не «недоступное».
  row.className =
    programRowClass(state) + (state === "past" && !watchable ? " dim" : "");
  // Нельзя включить — не кнопка для клавиатуры и мыши.
  row.disabled = !watchable;

  const t = document.createElement("span");
  t.className = "time";
  t.textContent = formatRange(p);
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
    live.textContent = "Эфир";
    body.append(live);
  } else if (state === "past" && watchable) {
    const arch = document.createElement("span");
    arch.className = "prog-arch";
    arch.innerHTML = iconMarkup("archive", "i-sm");
    arch.append("Смотреть из архива");
    body.append(arch);
  }
  row.append(t, body);

  if (watchable) {
    row.title = isLive ? "Смотреть сейчас" : "Смотреть из архива (catchup)";
    row.addEventListener("click", () => {
      if (isLive) {
        playChannel(c);
        onPlayed();
        return;
      }
      const url = buildCatchupUrl(cu, p, now);
      if (!url) {
        showToast("Провайдер не дал шаблон архива для этого канала");
        return;
      }
      nowTitle.textContent = `${c.name} · архив`;
      nowTitle.title = url;
      playerBar.hidden = false;
      setWatching(true);
      const refusedCatchup = player.play({ ...c, url });
      if (refusedCatchup) {
        showToast(refusedCatchup);
        return;
      }
      onPlayed();
    });
  } else if (state === "past") {
    row.title =
      cu.days > 0
        ? "Вне глубины архива"
        : "Архив недоступен на этом канале (нет tvg-rec)";
  }
  return row;
}

/** Передачи текущего канала по телепрограмме, по времени начала. */
function channelProgrammes(): EpgProgramme[] {
  if (!epg || !lastPlayed) return [];
  return (
    epg.get(`id:${lastPlayed.tvgId?.toLowerCase() ?? ""}`) ??
    epg.get(`name:${lastPlayed.normalizedName}`) ??
    []
  );
}

/**
 * Программа под плеером: одна прошедшая (её можно открыть из архива), та,
 * что идёт, и три следующие. Полная — в шторке «Вся программа».
 */
let scheduleKey = "";
function renderSchedule(): void {
  const all = channelProgrammes();
  const nowMs = Date.now();
  const i = all.findIndex((p) => Date.parse(p.start) <= nowMs && nowMs < Date.parse(p.stop));
  scheduleKey = lastPlayed && i >= 0 ? `${lastPlayed.url}|${all[i]!.start}` : "";
  schedList.textContent = "";
  nowSchedule.hidden = i < 0;
  if (i < 0) return;
  const now = new Date(nowMs);
  for (const p of all.slice(Math.max(0, i - 1), i + 4)) {
    schedList.append(programmeRow(p, now, () => undefined));
  }
}

btnGuide.addEventListener("click", openGuide);
btnFullGuide.addEventListener("click", openGuide);
guideClose.addEventListener("click", () => closeOverlay("guide"));
guideOverlay.addEventListener("click", (e) => {
  if (e.target === guideOverlay) closeOverlay("guide");
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !guideOverlay.hidden) closeOverlay("guide");
});

/** Край живого буфера или NaN, если поток ещё не начал грузиться. */
function liveEdge(): number {
  const r = videoEl.seekable;
  return r.length > 0 ? r.end(r.length - 1) : NaN;
}

/**
 * Полоса перемотки: ход текущей передачи по телепрограмме.
 *
 * У прямого эфира нет длительности, поэтому положение в потоке показывать
 * нечем — зато есть программа, и зрителю важно именно «сколько осталось
 * до конца передачи».
 */
function refreshScrub(): void {
  // Отставание от эфира считается ВСЕГДА: оно свойство буфера, а не
  // телепрограммы. Без этого кнопка молчала бы на каналах без EPG —
  // а отстать от эфира на них можно ровно так же.
  btnLive.hidden = !isBehindLive(videoEl.currentTime, liveEdge());

  const prog =
    epg && lastPlayed && snapshot ? getNowNext(epg, lastPlayed, snapshot).now : null;
  if (!prog) {
    if (scheduleKey) renderSchedule();
    scrubFill.style.width = "0%";
    progStart.textContent = "";
    progEnd.textContent = "";
    nowShow.textContent = "";
    nowTimeLeft.textContent = "";
    return;
  }
  const startMs = Date.parse(prog.start);
  const stopMs = Date.parse(prog.stop);
  const pct = `${(programmeProgress(Date.now(), startMs, stopMs) * 100).toFixed(1)}%`;
  scrubFill.style.width = pct;
  miniProgFill.style.width = pct; // та же цифра: свёрнутый плеер не врёт
  progStart.textContent = clock(startMs);
  progEnd.textContent = clock(stopMs);

  // Сменилась передача или канал — перестроить программу под плеером
  if (`${lastPlayed!.url}|${prog.start}` !== scheduleKey) renderSchedule();

  // Название передачи — сверху кадра, «ещё N мин» — у конца полосы
  nowShow.textContent = prog.title;
  nowTimeLeft.textContent = timeLeft(stopMs - Date.now());
}

/** «ещё 58 мин», «ещё 1 ч 5 мин» — до конца передачи. */
function timeLeft(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `ещё ${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `ещё ${h} ч` : `ещё ${h} ч ${m} мин`;
}

/**
 * Ряд «Продолжить»: до четырёх последних каналов карточками 16:9.
 * Показывается только в разделе «Каналы» и без активного поиска — иначе
 * дублировал бы результаты и занимал бы экран вместо них.
 */
function renderContinue(): void {
  const show =
    activeView === "channels" &&
    searchInput.value.trim() === "" &&
    activeCategory === null &&
    snapshot !== null;
  const items = show
    ? channelsForView("recents", snapshot!.channels, favorites, recents).slice(0, 4)
    : [];
  continueBlock.hidden = items.length === 0;
  continueRow.textContent = "";

  for (const c of items) {
    const card = document.createElement("button");
    card.className = "continue-card";
    card.title = c.name;

    const frame = document.createElement("div");
    frame.className = "continue-frame";
    // Монограмма — пока нет логотипа или он не загрузился: пустая серая
    // плашка выглядела поломкой.
    const mark = document.createElement("span");
    mark.className = "continue-mark";
    mark.textContent = c.name.trim().slice(0, 2).toUpperCase();
    frame.append(mark);
    if (c.logo) {
      const img = document.createElement("img");
      img.src = c.logo;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => img.remove());
      frame.append(img);
    }
    const prog = epg && snapshot ? getNowNext(epg, c, snapshot).now : null;
    if (prog) {
      const live = document.createElement("span");
      live.className = "live on-video";
      live.textContent = "Эфир";
      frame.append(live);

      const bar = document.createElement("div");
      bar.className = "prog";
      const fill = document.createElement("span");
      fill.style.width = `${(programmeProgress(Date.now(), Date.parse(prog.start), Date.parse(prog.stop)) * 100).toFixed(1)}%`;
      bar.append(fill);
      frame.append(bar);
    }
    card.append(frame);

    const meta = document.createElement("div");
    meta.className = "continue-meta";
    const name = document.createElement("span");
    name.className = "t-strong ellipsis";
    name.textContent = c.name;
    meta.append(name);
    card.append(meta);

    if (prog) {
      const nowLine = document.createElement("span");
      nowLine.className = "t-caption muted ellipsis num";
      nowLine.textContent = `${formatRange(prog)} · ${prog.title}`;
      card.append(nowLine);
    }

    card.addEventListener("click", () => playChannel(c));
    continueRow.append(card);
  }
}

btnLive.addEventListener("click", () => {
  const edge = liveEdge();
  if (Number.isFinite(edge)) videoEl.currentTime = edge;
  btnLive.hidden = true;
});

videoEl.addEventListener("timeupdate", refreshScrub);
// Передача идёт и без событий видео: без таймера полоса замирала бы на паузе
// и между timeupdate, которые HLS шлёт нерегулярно.
window.setInterval(refreshScrub, 10_000);

// ---- Жесты на кадре (телефон) ----
let touchStart: { x: number; y: number } | null = null;
let lastTapMs: number | null = null;

videoStage.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return; // мышью жесты не нужны
  touchStart = { x: e.clientX, y: e.clientY };
});

videoStage.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse" || !touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;

  const swipe = classifySwipe(dx, dy);
  if (swipe) {
    lastTapMs = null; // это движение, а не тап
    if (swipe === "up") playNeighbor(1);
    else if (swipe === "down") {
      // На развёрнутой странице свайп вниз возвращает в мини, иначе —
      // предыдущий канал: закрывать нечего.
      if (isCompact() && playerBar.classList.contains("open")) togglePlayerPage(false);
      else playNeighbor(-1);
    }
    return;
  }

  // Двойной тап у края — перемотка. Одиночный оставляем контролам.
  const rect = videoStage.getBoundingClientRect();
  const side = tapSide(e.clientX - rect.left, rect.width);
  if (side && isDoubleTap(lastTapMs, e.timeStamp)) {
    lastTapMs = null;
    seekBy(videoEl, side === "left" ? -15 : 15);
    showToast(side === "left" ? "−15 секунд" : "+15 секунд");
    return;
  }
  lastTapMs = e.timeStamp;
});

// Свайп вбок по свёрнутому плееру переключает канал
playerBar.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" || playerBar.classList.contains("open")) return;
  touchStart = { x: e.clientX, y: e.clientY };
});
playerBar.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse" || !touchStart) return;
  if (playerBar.classList.contains("open")) return;
  const swipe = classifySwipe(e.clientX - touchStart.x, e.clientY - touchStart.y);
  touchStart = null;
  if (swipe === "left") playNeighbor(1);
  else if (swipe === "right") playNeighbor(-1);
});

/** Через сколько контролы на видео прячутся, мс (правило дизайн-системы). */
const CONTROLS_HIDE_MS = 3000;
let controlsTimer = 0;

/**
 * Показать контролы и завести таймер их скрытия.
 * На паузе не прячем: пользователь смотрит не на кадр, а на управление.
 */
function wakeControls(): void {
  videoStage.classList.remove("idle");
  window.clearTimeout(controlsTimer);
  if (videoEl.paused) return;
  controlsTimer = window.setTimeout(() => {
    // Открытое меню качества или дорожек нельзя гасить вместе с контролами
    const menuOpen = !qualityMenu.hidden || !audioMenu.hidden || !subtitleMenu.hidden;
    if (menuOpen) {
      wakeControls();
      return;
    }
    videoStage.classList.add("idle");
  }, CONTROLS_HIDE_MS);
}

for (const ev of ["pointermove", "pointerdown", "focusin"] as const) {
  videoStage.addEventListener(ev, wakeControls);
}
videoEl.addEventListener("pause", wakeControls);
videoEl.addEventListener("loadedmetadata", () => refreshPlayerStatus());
videoEl.addEventListener("durationchange", () => refreshPlayerStatus());
videoEl.addEventListener("play", wakeControls);
videoStage.addEventListener("pointerleave", () => {
  if (!videoEl.paused) videoStage.classList.add("idle");
});

/**
 * Узкая ширина (телефон и планшет в портрете): плеер живёт мини-плеером и
 * разворачивается в страницу. Шире — колонкой рядом со списком. Должна
 * совпадать с медиазапросом в style.css — тест сверяет оба числа.
 */
const COMPACT_BREAKPOINT = 1023;

function isCompact(): boolean {
  return window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT}px)`).matches;
}

/** Развернуть мини-плеер в страницу или свернуть обратно. */
function togglePlayerPage(open?: boolean): void {
  const next = open ?? !playerBar.classList.contains("open");
  playerBar.classList.toggle("open", next);
}

// Тап по свёрнутому плееру разворачивает его в страницу. Кнопки внутри
// продолжают работать сами по себе — иначе пауза открывала бы плеер.
playerBar.addEventListener("click", (e) => {
  if (!isCompact() || playerBar.classList.contains("open")) return;
  if ((e.target as HTMLElement).closest("button, input, a")) return;
  togglePlayerPage(true);
});

btnExpand.addEventListener("click", (e) => {
  e.stopPropagation();
  // Кнопка есть только на узком экране: сворачивает страницу плеера в мини.
  // Театра больше нет — на широком место плееру даёт сворачивание списка.
  togglePlayerPage(false);
});

// Нативный fullscreen: применяем к #player-bar, чтобы контролы остались поверх
btnFullscreen.addEventListener("click", () => {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void playerBar.requestFullscreen?.().catch(() => {
      showToast("Полноэкранный режим недоступен");
    });
  }
});
document.addEventListener("fullscreenchange", () => {
  // Иконка одна на оба состояния — меняется только подсказка.
  btnFullscreen.title = document.fullscreenElement
    ? "Выйти из полного экрана (F)"
    : "На весь экран (F)";
});

// ---------- Поиск ----------
searchInput.addEventListener("input", () => renderChannels());

// ---------- Недавно просмотренные ----------
function loadRecentsFor(id: string): void {
  try {
    const raw = localStorage.getItem(recentsKey(id));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    recents = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    recents = [];
  }
}

// ---------- Тема ----------
let currentTheme: Theme = resolveTheme(
  typeof localStorage !== "undefined" ? localStorage : null,
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : null,
);
applyTheme(currentTheme);
setIcon(btnTheme, themeButtonLabel(currentTheme));
btnTheme.addEventListener("click", () => {
  currentTheme = toggleTheme(currentTheme);
  applyTheme(currentTheme);
  saveTheme(currentTheme, localStorage);
  setIcon(btnTheme, themeButtonLabel(currentTheme));
  renderThemeSeg();
});

/** Переключатель темы в настройках: своя тема или «как в системе». */
function renderThemeSeg(): void {
  const choice = themeChoice(typeof localStorage !== "undefined" ? localStorage : null);
  for (const b of themeSeg.querySelectorAll<HTMLButtonElement>("[data-theme-choice]")) {
    const on = b.dataset.themeChoice === choice;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  }
}

// ---------- Обновление плейлиста (#94) ----------
/** Периодичность из настроек; таймер тикает раз в минуту и сверяет её. */
let refreshInterval: RefreshInterval = loadInterval(
  typeof localStorage !== "undefined" ? localStorage : null,
);
let refreshBusy = false;
// Гард от гонки загрузок EPG (#112): сменили плейлист — старый ответ игнорируется.
const epgGuard = new LatestGuard();

function renderRefreshSeg(): void {
  for (const b of refreshSeg.querySelectorAll<HTMLButtonElement>("[data-refresh-choice]")) {
    const on = Number(b.dataset.refreshChoice) === refreshInterval;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  }
}

refreshSeg.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-refresh-choice]");
  if (!b) return;
  refreshInterval = Number(b.dataset.refreshChoice) as RefreshInterval;
  saveInterval(refreshInterval, typeof localStorage !== "undefined" ? localStorage : null);
  renderRefreshSeg();
  // Смена «Выключено → Час» не должна ждать полного интервала до первой проверки
  if (refreshInterval !== 0) saveLastCheck(0, localStorage);
});

/**
 * Обновить активный плейлист из сети. Уведомление в колокольчик — только
 * когда есть что сказать: дельта каналов или новые скрытые http.
 */
async function refreshPlaylist(silentOnNoChange: boolean): Promise<void> {
  if (refreshBusy) return;
  const item = plState.items.find((p) => p.id === plState.activeId);
  if (!item || !snapshot) return;
  refreshBusy = true;
  btnRefreshNow.setAttribute("aria-busy", "true");
  try {
    const resp = await fetch(item.playlistUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const fresh = parseM3U(await resp.text());
    const diff = diffSnapshots(snapshot, fresh);
    const httpNew = Math.max(0, fresh.droppedHttp - snapshot.droppedHttp);
    const interesting =
      diff.added > 0 || diff.removed > 0 || diff.changed > 0 || httpNew > 0;

    // Программа меняется постоянно — обновляем её при каждой проверке,
    // а не только когда изменился сам плейлист (#104). Гард (#112): если
    // во время проверки переключили плейлист, её EPG не применяется.
    const epgUrl = item.epgUrl ?? fresh.headerTvgUrl;
    let programmes: number | null = null;
    if (epgUrl) {
      const epgLoad = epgGuard.begin();
      try {
        const parsed = await loadEpg(epgUrl);
        if (epgLoad.isCurrent()) {
          epg = parsed;
          programmes = countProgrammes(epg);
        }
      } catch {
        // программа не критична: списки всё равно обновим, уведомим «передач нет»
      }
    }

    // Автоподстановка EPG в свойства плейлиста: явно заданный не трогаем (#104)
    if (!item.epgUrl && fresh.headerTvgUrl) {
      plState = updatePlaylist(plState, item.id, { epgUrl: fresh.headerTvgUrl });
      savePlaylists(localStorage, plState);
      renderPlaylistManager();
    }

    if (interesting || !silentOnNoChange) {
      if (interesting) {
        snapshot = fresh;
        renderCategories();
        renderChannels();
        renderPlaylistSwitcher();
        refreshNowFav();
      }
      pushNotification(
        checkSummary(diff, fresh.channels.length, programmes ?? 0, programmes !== null),
      );
    }
  } catch {
    if (!silentOnNoChange) {
      showToast("Проверить плейлист не удалось — нет сети или источник недоступен");
    }
  } finally {
    refreshBusy = false;
    btnRefreshNow.removeAttribute("aria-busy");
    saveLastCheck(Date.now(), typeof localStorage !== "undefined" ? localStorage : null);
  }
}

btnRefreshNow.addEventListener("click", () => void refreshPlaylist(false));

// Тик раз в минуту: пора ли плановая проверка по выбранному интервалу.
setInterval(() => {
  if (refreshInterval === 0) return;
  const storage = typeof localStorage !== "undefined" ? localStorage : null;
  if (shouldCheck(Date.now(), loadLastCheck(storage), refreshInterval)) {
    void refreshPlaylist(true);
  }
}, 60_000);

// Возврат из долгого фона: если с последней проверки прошло больше выбранного
// интервала — проверяем сразу, не дожидаясь минутного тика. Пока вкладка
// в фоне таймеры троттлятся, поэтому без этого данные могли бы устареть.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (refreshInterval === 0 || refreshBusy) return;
  const storage = typeof localStorage !== "undefined" ? localStorage : null;
  if (shouldCheck(Date.now(), loadLastCheck(storage), refreshInterval)) {
    void refreshPlaylist(true);
  }
});

function systemPrefersDark(): boolean | null {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : null;
}

themeSeg.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-theme-choice]");
  if (!b) return;
  const choice = b.dataset.themeChoice as ThemeChoice;
  if (choice === "system") {
    clearTheme(localStorage);
    currentTheme = resolveTheme(null, systemPrefersDark());
  } else {
    currentTheme = choice;
    saveTheme(currentTheme, localStorage);
  }
  applyTheme(currentTheme);
  setIcon(btnTheme, themeButtonLabel(currentTheme));
  renderThemeSeg();
});

// «Как в системе» — значит и следом за системой, когда она переключится
if (typeof window.matchMedia === "function") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (themeChoice(localStorage) !== "system") return;
    currentTheme = e.matches ? "dark" : "light";
    applyTheme(currentTheme);
    setIcon(btnTheme, themeButtonLabel(currentTheme));
  });
}

// ---------- Избранное ----------
/** Загрузить избранное по ключу плейлиста (localStorage, нестандартный ключ). */
function loadFavoritesFor(id: string): Set<string> {
  try {
    const raw = localStorage.getItem(favoritesKey(id));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

/** Сохранить избранное по ключу плейлиста (best-effort). */
function saveFavoritesFor(id: string): void {
  try {
    localStorage.setItem(favoritesKey(id), JSON.stringify([...favorites]));
  } catch {
    // приватный режим / quota
  }
}

/** Активировать плейлист по id: перезагрузить его избранное и список. */
function activatePlaylist(id: string): void {
  plState = { ...plState, activeId: id };
  savePlaylists(localStorage, plState);
  favorites = loadFavoritesFor(id);
  loadRecentsFor(id);
  const pl = activePlaylist(plState);
  if (pl) {
    void openPlaylist(pl.playlistUrl, pl.epgUrl);
  }
}

// ---------- Менеджер плейлистов (setup-экран) ----------
function renderPlaylistManager(): void {
  plList.textContent = "";
  for (const p of plState.items) {
    const active = p.id === plState.activeId;
    const row = document.createElement("div");
    row.className = active ? "item pl-row active" : "item pl-row";

    // Вся строка — выбор плейлиста: радиокнопка, название, откуда он
    const pick = document.createElement("button");
    pick.className = "pl-pick";
    pick.setAttribute("role", "radio");
    pick.setAttribute("aria-checked", String(active));
    pick.title = active ? "Этот плейлист открыт" : "Открыть этот плейлист";
    const radio = document.createElement("span");
    radio.className = "radio";
    const text = document.createElement("span");
    text.className = "pl-text";
    const name = document.createElement("span");
    name.className = "pl-name";
    name.textContent = p.name;
    const url = document.createElement("span");
    url.className = "pl-url muted";
    url.textContent = urlLabel(p.playlistUrl, p.epgUrl);
    text.append(name, url);
    pick.append(radio, text);
    pick.addEventListener("click", () => {
      if (!active) activatePlaylist(p.id);
      else showPlayer();
    });

    const edit = document.createElement("button");
    edit.className = "icon-btn pl-act";
    edit.title = "Переименовать или изменить ссылки";
    edit.setAttribute("aria-label", `Изменить «${p.name}»`);
    setIcon(edit, "edit");
    edit.addEventListener("click", () => {
      // Инлайн-редактирование: строка превращается в форму
      row.textContent = "";
      row.classList.add("editing");
      const form = document.createElement("form");
      form.className = "pl-edit";
      form.noValidate = true;
      const mk = (label: string, value: string, type = "text"): HTMLInputElement => {
        const field = document.createElement("label");
        field.className = "field";
        const l = document.createElement("span");
        l.className = "field-label";
        l.textContent = label;
        const box = document.createElement("span");
        box.className = "input";
        const input = document.createElement("input");
        input.type = type;
        input.value = value;
        box.append(input);
        field.append(l, box);
        form.append(field);
        return input;
      };
      const nameIn = mk("Название", p.name);
      const urlIn = mk("Ссылка на плейлист", p.playlistUrl, "url");
      const epgIn = mk("Ссылка на телепрограмму (необязательно)", p.epgUrl ?? "", "url");
      const btns = document.createElement("div");
      btns.className = "pl-edit-actions";
      const save = document.createElement("button");
      save.className = "btn btn-primary btn-sm";
      save.type = "submit";
      save.textContent = "Сохранить";
      const cancel = document.createElement("button");
      cancel.className = "btn btn-ghost btn-sm";
      cancel.type = "button";
      cancel.textContent = "Отмена";
      btns.append(save, cancel);
      form.append(btns);
      row.append(form);
      nameIn.focus();

      cancel.addEventListener("click", () => renderPlaylistManager());
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const newName = nameIn.value.trim();
        const newUrl = urlIn.value.trim();
        const newEpg = epgIn.value.trim();
        if (!/^https?:\/\//.test(newUrl)) {
          setupError.textContent = "Нужна ссылка, начинающаяся с http:// или https://";
          setupError.hidden = false;
          return;
        }
        plState = updatePlaylist(plState, p.id, {
          name: newName || p.name,
          playlistUrl: newUrl,
          epgUrl: newEpg || null,
        });
        savePlaylists(localStorage, plState);
        setupError.hidden = true;
        renderPlaylistManager();
        renderPlaylistSwitcher();
      });
    });

    const del = document.createElement("button");
    del.className = "icon-btn pl-act pl-del";
    del.title = "Удалить плейлист (его избранное тоже удалится)";
    del.setAttribute("aria-label", `Удалить «${p.name}»`);
    setIcon(del, "trash");
    del.addEventListener("click", () => {
      if (!window.confirm(`Удалить «${p.name}»?`)) return;
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(favoritesKey(p.id));
      }
      plState = removePlaylist(plState, p.id);
      savePlaylists(localStorage, plState);
      renderPlaylistManager();
      renderPlaylistSwitcher();
      renderSettingsMode();
    });

    row.append(pick, edit, del);
    plList.append(row);
  }
}

/** «storage.yandexcloud.net · с телепрограммой» — откуда плейлист, коротко. */
function urlLabel(playlistUrl: string, epgUrl: string | null): string {
  let host = playlistUrl;
  try {
    host = new URL(playlistUrl).host;
  } catch {
    // оставим как есть
  }
  return epgUrl ? `${host} · с телепрограммой` : host;
}

// ---------- Экспорт / импорт настроек ----------
btnExport.addEventListener("click", () => {
  const favs: Record<string, string[]> = {};
  for (const p of plState.items) {
    const list = loadFavoritesFor(p.id);
    if (list.size > 0) favs[p.id] = [...list];
  }
  const recentsBackup: Record<string, string[]> = {};
  for (const p of plState.items) {
    try {
      const raw = localStorage.getItem(recentsKey(p.id));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        const urls = parsed.filter((x): x is string => typeof x === "string");
        if (urls.length > 0) recentsBackup[p.id] = urls;
      }
    } catch { /* битые данные — пропускаем */ }
  }
  const backup = buildBackup({
    theme: document.documentElement.dataset.theme ?? "dark",
    playlists: plState.items,
    activeId: plState.activeId,
    favorites: favs,
    recents: recentsBackup,
  });
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `iptv-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  showToast("Настройки экспортированы");
});

btnImport.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
  const file = importFile.files?.[0];
  if (!file) return;
  file
    .text()
    .then((text) => {
      const result = parseBackup(text);
      if (!result.ok) {
        showToast(`Импорт не удался: ${result.error}`);
        return;
      }
      const data = result.data;
      // темы
      if (data.theme !== document.documentElement.dataset.theme) {
        btnTheme.click();
      }
      // плейлисты + избранное (замена целиком)
      plState = { items: data.playlists, activeId: data.activeId };
      savePlaylists(localStorage, plState);
      for (const [plId, urls] of Object.entries(data.favorites)) {
        try {
          localStorage.setItem(favoritesKey(plId), JSON.stringify(urls));
        } catch { /* приватный режим */ }
      }
      // «Недавние» — только для плейлистов из бэкапа (существующие ключи
      // других плейлистов не трогаем).
      if (data.recents) {
        for (const [plId, urls] of Object.entries(data.recents)) {
          try {
            localStorage.setItem(recentsKey(plId), JSON.stringify(urls));
          } catch { /* приватный режим */ }
        }
      }
      // Сразу отражаем recents активного плейлиста в UI.
      if (data.activeId) loadRecentsFor(data.activeId);
      renderPlaylistManager();
      renderPlaylistSwitcher();
      showToast(`Импортировано плейлистов: ${data.playlists.length}`);
      const active = activePlaylist(plState);
      if (active) void openPlaylist(active.playlistUrl, active.epgUrl);
    })
    .catch(() => showToast("Не удалось прочитать файл"))
    .finally(() => {
      importFile.value = ""; // повторный выбор того же файла тоже сработает
    });
});

// ---------- Переключатель плейлистов (топбар) ----------
function renderPlaylistSwitcher(): void {
  const active = activePlaylist(plState);
  plSwitch.hidden = !active;
  if (!active) return;
  plSwitchName.textContent = active.name;
  // Видимый текст — название, а имя кнопки для скринридера — её действие
  plSwitchBtn.setAttribute("aria-label", `Плейлист «${active.name}», переключить`);
  plSwitchCount.textContent = snapshot ? channelsWord(snapshot.channels.length) : "";
  plSwitchMenu.textContent = "";
  for (const p of plState.items) {
    const b = document.createElement("button");
    b.className =
      menuItemClass(p.id === plState.activeId);
    b.textContent = p.name;
    b.addEventListener("click", () => {
      plSwitchMenu.hidden = true;
      plSwitchBtn.setAttribute("aria-expanded", "false");
      if (p.id !== plState.activeId) activatePlaylist(p.id);
    });
    plSwitchMenu.append(b);
  }
}

plSwitchBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = plSwitchMenu.hidden;
  plSwitchMenu.hidden = !willOpen;
  plSwitchBtn.setAttribute("aria-expanded", String(willOpen));
});
document.addEventListener("click", (e) => {
  if (!plSwitchMenu.hidden && !plSwitch.contains(e.target as Node)) {
    plSwitchMenu.hidden = true;
    plSwitchBtn.setAttribute("aria-expanded", "false");
  }
});

// ---------- Setup ----------
addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const pUrl = setupPlaylist.value.trim();
  const eUrl = setupEpg.value.trim();
  const name = setupName.value.trim();
  if (!/^https?:\/\//.test(pUrl)) {
    showSetup("Нужен http(s)-URL плейлиста");
    return;
  }
  // http-плейлисты разрешены: если страница https, браузер может заблокировать
  // такой запрос (mixed content) — предупредим заранее, но не блокируем.
  if (isMixedContent(window.location.href, pUrl)) {
    showToast(
      "Плейлист по http://: страница открыта по https://, браузер может заблокировать запрос. Если загрузка упадёт — используйте https-ссылку.",
    );
  }
  plState = addPlaylist(plState, name || "Плейлист", pUrl, eUrl || null);
  savePlaylists(localStorage, plState);
  setupPlaylist.value = "";
  setupEpg.value = "";
  setupName.value = "";
  renderPlaylistManager();
  renderPlaylistSwitcher();
  activatePlaylist(plState.items[plState.items.length - 1]!.id);
});

async function loadPlaylist(url: string): Promise<PlaylistSnapshot> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`плейлист: HTTP ${resp.status}`);
  if (!/^application\/(x-mpegurl|vnd\.apple\.mpegurl|octet-stream)/.test(
        resp.headers.get("content-type") ?? "")) {
    // не фейлимся: некоторые бакеты отдают text/plain
  }
  return parseM3U(await resp.text());
}

// ---------- Boot ----------
/**
 * Подсказка по причине сетевого сбоя: смешанный контент или CORS.
 * NetworkError браузера не различает — перечисляем оба сценария с чек-листом.
 */
function describeFetchFailure(url: string, reason?: string): string {
  // Точная причина от плеера главнее: она знает, что уже предпринято
  // (например, попытку https-порта), и не должна подменяться общим текстом.
  if (reason) return reason;
  if (isMixedContent(window.location.href, url)) {
    return (
      "Ссылка http://, а страница открыта по https:// — браузер блокирует " +
      "смешанный контент. Плеер уже пробует https-порт 443; если не помогло — " +
      "найдите https-ссылку или откройте сайт по http (локально)."
    );
  }
  return "Возможные причины: (1) на бакете не включён CORS — добавьте правило для " +
    "origin https://ozyab09.github.io (см. README), (2) ссылка недоступна " +
    "из браузера (приватный бакет, firewall). Проверьте консоль (F12) — " +
    "там будет точная причина (blocked by CORS policy / net::ERR_…).";
}

/** Открыть плейлист: загрузка + рендер + EPG. Общая для boot/переключения. */
async function openPlaylist(url: string, epgUrl: string | null): Promise<void> {
  stopIfRecording();
  player.stop();
  playerBar.hidden = true;
  setWatching(false);
  lastPlayed = null;
  snapshot = null;
  epg = null;
  showPlayer();
  epgNow.hidden = false;
  epgNow.textContent = "Загрузка плейлиста…";

  try {
    snapshot = await loadPlaylist(url);
  } catch (e) {
    showSetup(
      `Не удалось загрузить плейлист: ${e instanceof Error ? e.message : "ошибка"}. ` +
        describeFetchFailure(url),
    );
    return;
  }

  renderCategories();
  renderChannels();
  renderPlaylistSwitcher(); // число каналов рядом с названием плейлиста
  // Скрытые http-каналы — не потеря каналов при загрузке, а фильтр.
  // Извещаем уведомлением с колокольчиком сверху справа, ровно один раз
  // на плейлист (src/http-notice.ts): длинный текст в трёхсекундном тосте
  // не прочесть, а при каждом переключении плейлистов оно стало бы спамом.
  if (snapshot.droppedHttp > 0 && plState.activeId &&
      shouldShowHttpNotice(plState.activeId, localStorage)) {
    pushNotification(
      `Скрыто ${channelsWord(snapshot.droppedHttp)} по http:// — на https-странице браузер их блокирует. Если у провайдера есть https-ссылки — замените их в плейлисте.`,
    );
    markHttpNoticeShown(plState.activeId, localStorage);
  }
  // Служебная строка нужна, только пока что-то грузится или не удалось:
  // счётчики «Каналов: N · Категорий: M» уже видны в шапке и у категорий.
  epgNow.hidden = true;

  const finalEpgUrl = epgUrl ?? snapshot.headerTvgUrl;
  if (finalEpgUrl) {
    epgNow.hidden = false;
    epgNow.textContent = "Загружаем телепрограмму…";
    // Гард от гонки (#112): пока грузится EPG, можно успеть сменить плейлист —
    // поздний ответ старой загрузки не должен затирать данные нового.
    const epgLoad = epgGuard.begin();
    loadEpg(finalEpgUrl)
      .then((parsed) => {
        if (!epgLoad.isCurrent()) return;
        epg = parsed;
        renderChannels();
        refreshNowFav();
        epgNow.hidden = true;
      })
      .catch(() => {
        if (!epgLoad.isCurrent()) return;
        epgNow.textContent = "Телепрограмма не загрузилась — каналы работают без неё";
      });
  }
}

async function bootstrap(): Promise<void> {
  renderPlaylistManager();
  renderPlaylistSwitcher();

  // GET-параметры приоритетны: upsert в список и активация
  const params = new URLSearchParams(window.location.search);
  const p = params.get("p")?.trim() ?? "";
  if (p && /^https?:\/\//.test(p)) {
    const e = params.get("e")?.trim() ?? "";
    plState = upsertByUrl(
      plState,
      p,
      e && /^https?:\/\//.test(e) ? e : null,
    );
    savePlaylists(localStorage, plState);
    renderPlaylistManager();
    renderPlaylistSwitcher();
  }

  const active = activePlaylist(plState);
  if (!active) {
    showSetup();
    return;
  }
  favorites = loadFavoritesFor(active.id);
  loadRecentsFor(active.id);
  await openPlaylist(active.playlistUrl, active.epgUrl);
}

// (legacy STORAGE_KEY из config.ts больше не используется — миграция в playlists.ts)

// ---------- PWA: service worker + онлайн-статус ----------
// SW регистрируется только в прод-сборке: в dev он кеширует статику и мешает HMR.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // Была ли страница уже под старым SW: при первой установке смена
  // контроллера — не обновление, и перезагружать нечего.
  const hadController = navigator.serviceWorker.controller !== null;
  let reloading = false;

  // Новая версия взяла страницу под контроль. Вёрстка в памяти — от прошлой
  // сборки, а стили и скрипты с сервера — уже от новой: отсюда «смесь»
  // старого и нового дизайна. Если ничего не играет — просто перезагружаем;
  // если идёт эфир — не обрываем его, а предлагаем обновиться.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    const playing = !playerBar.hidden && !videoEl.paused;
    if (!playing) {
      reloading = true;
      window.location.reload();
      return;
    }
    showToastAction(
      "Вышла новая версия приложения",
      "Обновить",
      () => {
        reloading = true;
        window.location.reload();
      },
      30_000,
    );
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        // Вкладку на телефоне могут не закрывать неделями: проверяем
        // обновление, когда к ней возвращаются, и раз в час, пока открыта.
        const check = (): void => void reg.update().catch(() => undefined);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        window.setInterval(check, 60 * 60 * 1000);
      })
      .catch(() => {
        // SW не критичен: без него приложение полностью работает
      });
  });
}

window.addEventListener("offline", () => {
  showToast("Нет сети — плейлист и EPG будут загружены из кэша, если есть");
});
window.addEventListener("online", () => showToast("Сеть вернулась"));

// Навигация рисуется до загрузки плейлиста: пустой таб-бар в первые секунды
// выглядел бы поломкой.
renderNav();
bootstrap();
