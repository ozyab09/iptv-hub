import "./style.css";
import { createCatalogueCard } from "./catalogue-card";
import { resumeEpisode } from "./xtream-catalogue";
import { parseExternalSubtitles, parseSubtitlePreference, subtitlePreferenceKey, type SubtitleCue } from "./external-subtitles";
import { createRecordingScheduleUi } from "./recording-schedule-ui";
import { channelHealthKey, parseChannelHealth, serializeChannelHealth, markChannelFailure, clearChannelFailure, isChannelRecovered, type ChannelHealth, type ChannelFailure } from "./channel-health";
import { createGroupPreferencesUi } from "./group-preferences-ui";
import { groupPreferencesKey, parseGroupPreferences, serializeGroupPreferences, orderedGroups, moveGroup, type GroupPreferences } from "./group-preferences";
import { applyFavoritesOrder, favoritesOrderKey, moveFavorite, parseFavoritesOrder } from "./favorites-order";
import { appendZapDigit, zapChannelIndex, ZAP_DELAY_MS, type NumericZap } from "./numeric-zap";
import { LANGUAGE_KEY, resolveLanguage, t, translateMessage, type Language, type TranslationKey, type TranslationParams } from "./i18n";
import { installDebugLog } from "./debug-log";
import { iconMarkup, spriteMarkup } from "./icons";
import {
  channelsForView,
  filterVisibleGroups,
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
  addLocalPlaylist,
  loadPlaylists,
  savePlaylists,
  updatePlaylist,
  upsertByUrl,
  favoritesKey,
  type PlaylistsState,
} from "./playlists";
import {
  applyFavorites,
  buildFavoritesM3U,
  isFavorite,
  toggleFavorite,
} from "./favorites";
import { validateXtream, xtreamApiUrl, xtreamEpgUrl } from "./xtream";
import { createOpfsFs, createTransport, type Transport } from "./playlist-transport";
import { formatRange, getNowNext, loadEpgSources } from "./epg";
import { epgSourceUrls, epgSourcesInput } from "./epg-sources";
import { searchProgrammes, programmeArchiveUrl, type ProgrammeMatch } from "./programme-search";
import { createDebounced } from "./debounce";
import { DEFAULT_PLAYER_SETTINGS, PLAYER_SETTINGS_KEY, parsePlayerSettings, sanitizePlayerSettings } from "./player-settings";
import {
  computeWindow,
  columnsForWidth,
  spacerHeight,
} from "./virtual-list";
import { clock, isBehindLive, mediaScrub, programmeProgress, scrubSeekTarget } from "./scrub";
import { classifySwipe, isDoubleTap, isLongPress, tapSide } from "./gestures";
import {
  loadPosition,
  savePosition,
} from "./positions";
import {
  addRecording,
  formatBytes,
  formatDuration,
  loadRecordings,
  removeRecording,
  type RecordingMeta,
} from "./recordings";
import {
  createRecordingsFs,
  listOpfsNames,
  recordingFileName as storedRecordingName,
  type RecordingsFs,
} from "./recordings-store";
import {
  clearRecordingPending,
  markRecordingPending,
  recoverPendingRecording,
} from "./recording-recovery";
import { firstFocus, lastFocus, moveFocus } from "./kbd-nav";
import {
  defaultLocalName,
  looksLikeM3U,
  saveLocalPlaylist,
} from "./local-playlist";
import {
  describeShotFailure,
  screenshotFileName,
  type ShotFailure,
} from "./screenshot";
import {
  initialSleepState,
  sleepCancel,
  sleepLabel,
  sleepRemainderMin,
  sleepStart,
  sleepStartEpisode,
  sleepTick,
  type SleepState,
} from "./sleep-timer";
import { classifyStorageChange } from "./cross-tab";
import { resolveChannelDeepLink } from "./deeplink";
import {
  initialWakeLockState,
  wakeLockHidden,
  wakeLockPlay,
  wakeLockStop,
  wakeLockVisible,
  type WakeLockState,
} from "./wake-lock";
import { type OverlayName, popOverlay, pushOverlay, topOverlay } from "./overlays";
import { canHotkey } from "./hotkey-guard";
import { mediaKeyAction, type MediaKeyAction } from "./media-keys";
import { getNetworkConnection, neighborIndex, Player } from "./player";
import {
  applyTheme,
  syncStatusBarAppearance,
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
  programmeStartUrl,
  hourlyFallbackProgrammes,
  dayWindows,
  programmesInDay,
  type DayWindow,
} from "./catchup";
import { cancelDownload, downloadProgramme, downloadStatus } from "./programme-downloader";
import { createQualityMenu } from "./quality-menu";
import { createPlaylistUi, type PlaylistUiNodes } from "./playlist-ui";
import { createMultiViewUi } from "./multi-view-ui";
import { createTimelineGuide } from "./timeline-guide-ui";
import { createProgrammeReminders } from "./reminder-ui";
import { readBackupSections, restoreBackup } from "./backup-storage";
import { missingLocalFiles, readLocalPlaylistFiles, restoreLocalPlaylistFiles } from "./backup-local";
import type { NotificationWatch } from "./notifications";
import { applyChannelOverrides, channelOverridesKey, parseChannelOverrides, serializeChannelOverrides, setChannelOverride, type ChannelOverrides } from "./channel-overrides";
import { createPinHash, parentalPinsKey, parseParentalPins, serializeParentalPins, verifyPin, type ParentalPins } from "./parental-pin";
import { createPinDialog } from "./parental-pin-ui";
import type { Channel, EpgProgramme, PlaylistSnapshot } from "./types";
import { nowHeaderFor } from "./now-header";
import {
  shouldShowHttpNotice,
  markHttpNoticeShown,
} from "./http-notice";
import { createNotificationBell } from "./notification-bell";
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

let savedLanguage: string | null = null;
try { savedLanguage = localStorage.getItem(LANGUAGE_KEY); } catch { /* приватный режим */ }
let currentLanguage = resolveLanguage(savedLanguage, navigator.language);
const tr = (key: TranslationKey, params: TranslationParams = {}): string => t(key, currentLanguage, params);

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

// DOM-узлы менеджера плейлистов — модуль playlist-ui.ts, инъекция ниже (issue #123)
const playlistUiNodes: PlaylistUiNodes = {
  plList: $("pl-list"),
  plSwitch: $("pl-switch"),
  plSwitchBtn: $<HTMLButtonElement>("pl-switch-btn"),
  plSwitchMenu: $("pl-switch-menu"),
  plSwitchName: $("pl-switch-name"),
  plSwitchCount: $("pl-switch-count"),
};
const setupPlaylist = $<HTMLInputElement>("setup-playlist");
const setupEpg = $<HTMLInputElement>("setup-epg");
const setupAdditionalEpg = $<HTMLInputElement>("setup-additional-epg");
const setupLoad = $<HTMLButtonElement>("setup-load");
const setupName = $<HTMLInputElement>("setup-name");
const addForm = $<HTMLFormElement>("add-form");
const xtreamHost = $<HTMLInputElement>("xtream-host");
const xtreamUser = $<HTMLInputElement>("xtream-user");
const xtreamPassword = $<HTMLInputElement>("xtream-password");
const xtreamVod = $<HTMLInputElement>("xtream-vod");
let xtreamMode = false;
$("source-type").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-source]");
  if (!button) return;
  xtreamMode = button.dataset.source === "xtream";
  $("m3u-fields").hidden = xtreamMode;
  $("xtream-fields").hidden = !xtreamMode;
  for (const option of $("source-type").querySelectorAll("button")) {
    option.setAttribute("aria-checked", String(option === button));
    option.classList.toggle("on", option === button);
  }
  (xtreamMode ? xtreamHost : setupPlaylist).focus();
});
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

// Wake Lock (FR-7): запрос/релиз через нативный API, где его нет —
// hooks без request превращает всё в тихий no-op.
let wakeLockState: WakeLockState = initialWakeLockState;
const wakeLockHooks = {
  request: (): { release: () => void } | null => {
    const wl = (navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    if (!wl) return null;
    let released = false;
    let lock: { release: () => Promise<void> } | null = null;
    wl.request("screen").then(
      (l) => {
        if (released) {
          l.release().catch(() => undefined);
          return;
        }
        lock = l;
      },
      () => segSession.resetStream(),
    );
    return {
      release: () => {
        released = true;
        lock?.release().catch(() => undefined);
      },
    };
  },
};
const videoEl = $<HTMLVideoElement>("video");
const videoStage = $("video-stage");
const liveBadge = $("live-badge");
const scrub = $("scrub");
let scrubDrag: { pointerId: number; time: number } | null = null;
const scrubFill = $("scrub-fill");
const progStart = $("prog-start");
const progEnd = $("prog-end");
const btnLive = $<HTMLButtonElement>("btn-live");
const btnProgrammeStart = $<HTMLButtonElement>("btn-programme-start");
let archivePlayback: { url: string; programme: EpgProgramme | null; fromStart: boolean } | null = null;
const miniProgFill = $("mini-prog-fill");
const continueBlock = $("continue-block");
const continueRow = $("continue-row");

const nowTitle = $("now-title");
const nowCategory = $("now-category");
const nowShow = $("now-show");
const nowTimeLeft = $("now-time-left");
const btnCollapseList = $<HTMLButtonElement>("btn-collapse-list");
const btnHidePanel = $<HTMLButtonElement>("btn-hide-panel");
const btnRestorePanel = $<HTMLButtonElement>("btn-restore-panel");
const btnShowMenu = $<HTMLButtonElement>("btn-show-menu");
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
const btnExportFav = $<HTMLButtonElement>("btn-export-fav");
const btnImport = $<HTMLButtonElement>("btn-import");
const importFile = $<HTMLInputElement>("import-file");
const sideNav = $("side-nav");
const tabbar = $("tabbar");
const viewTitle = $("view-title");
const viewCount = $("view-count");
const catLabel = $("cat-label");
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
const guideGrid = $("guide-grid");
const guideListMode = $("guide-mode-list");
const guideGridMode = $("guide-mode-grid");
let guideGridOn = false;
let timelineGuideUi: ReturnType<typeof createTimelineGuide> | null = null;
let reminderUi: ReturnType<typeof createProgrammeReminders> | null = null;
const nowSchedule = $("now-schedule");
const schedList = $("sched-list");
const btnFullGuide = $<HTMLButtonElement>("btn-full-guide");
const guideClose = $<HTMLButtonElement>("guide-close");
const btnRec = $<HTMLButtonElement>("btn-rec");
const btnShot = $<HTMLButtonElement>("btn-shot");
const btnSleep = $<HTMLButtonElement>("btn-sleep");
const sleepBadge = $("sleep-badge");
const sleepMenu = $("sleep-menu");
const nowFav = $<HTMLButtonElement>("now-fav");
const btnTheme = $<HTMLButtonElement>("btn-theme");

// ---------- Состояние ----------
let snapshot: PlaylistSnapshot | null = null;
let channelOverrides: ChannelOverrides = new Map();
let channelHealth: ChannelHealth = new Map();
let healthAttempt: { playlistId: string; url: string } | null = null;

function currentHealthAttempt(): typeof healthAttempt {
  return healthAttempt && healthAttempt.playlistId === plState.activeId && player.currentChannelUrl === healthAttempt.url ? healthAttempt : null;
}

function persistChannelHealth(): void {
  if (!plState.activeId) return;
  try {
    if (channelHealth.size) localStorage.setItem(channelHealthKey(plState.activeId), serializeChannelHealth(channelHealth));
    else localStorage.removeItem(channelHealthKey(plState.activeId));
  } catch { /* Метки остаются в текущей сессии. */ }
  renderChannels(false);
}

function noteChannelFailure(): void {
  const attempt = currentHealthAttempt();
  if (!attempt) return;
  channelHealth = markChannelFailure(channelHealth, attempt.url, {
    failedAt: Date.now(), kind: isMixedContent(window.location.href, attempt.url) ? "mixed-content" : "unknown",
  });
  persistChannelHealth();
}

function noteChannelRecovered(event: Event): void {
  const attempt = currentHealthAttempt();
  const hasVideo = videoEl.videoWidth > 0 || !!player.getHls()?.levels.some((level) => level.videoCodec);
  if (!attempt || !channelHealth.has(attempt.url) || !isChannelRecovered(videoEl, event.type, hasVideo)) return;
  channelHealth = clearChannelFailure(channelHealth, attempt.url);
  persistChannelHealth();
}

videoEl.addEventListener("loadeddata", noteChannelRecovered);
videoEl.addEventListener("playing", noteChannelRecovered);

$("channel-health-reset").addEventListener("click", () => {
  channelHealth = new Map();
  persistChannelHealth();
});

function channelFailureLabel(failure: ChannelFailure): string {
  const reason = failure.kind === "http" ? `HTTP ${failure.status ?? ""}` : tr(`health.${failure.kind}`);
  return tr("health.detail", { time: new Date(failure.failedAt).toLocaleString(currentLanguage), reason });
}
let groupPreferences: GroupPreferences = parseGroupPreferences(null);

function displayChannels(): Channel[] {
  return filterVisibleGroups(applyChannelOverrides(snapshot?.channels ?? [], channelOverrides), groupPreferences.hidden);
}

function renderGroupSettings(): void {
  groupPreferencesUi.render(snapshot?.categories ?? [], groupPreferences);
}

function refreshGroupPreferences(previousHidden: ReadonlySet<string>): void {
  playRequest++;
  pinDialog.cancel();
  if (activeCategory && groupPreferences.hidden.has(activeCategory)) activeCategory = null;
  const newlyHidden = [...groupPreferences.hidden].some((group) => !previousHidden.has(group));
  if ((multiViewUi.isOpen && newlyHidden) || (lastPlayed && groupPreferences.hidden.has(lastPlayed.group))) btnClosePlayer.click();
  renderGroupSettings();
  renderCategories();
  renderChannels();
  renderPlaylistSwitcher();
}

function saveGroupPreferences(next: GroupPreferences): void {
  if (!plState.activeId) return;
  const previousHidden = groupPreferences.hidden;
  groupPreferences = next;
  try { localStorage.setItem(groupPreferencesKey(plState.activeId), serializeGroupPreferences(next)); } catch { /* текущая сессия */ }
  refreshGroupPreferences(previousHidden);
}
let epg: Map<string, import("./types").EpgProgramme[]> | null = null;
let activeCategory: string | null = null;
let plState: PlaylistsState = loadPlaylists(
  typeof localStorage !== "undefined" ? localStorage : null,
);
let scheduleUi: ReturnType<typeof createRecordingScheduleUi> | null = null;
let favKey: string | null = null; // favoritesKey(id) активного плейлиста (legacy)
void favKey;
let favorites = new Set<string>();
let favoritesOrder: string[] = [];
const VIEW_KEY = "iptv-hub.view.v1";
let activeView: View = parseView(
  typeof localStorage !== "undefined" ? localStorage.getItem(VIEW_KEY) : null,
);
/** Плоский список каналов в текущем рендере — для prev/next в плеере. */
let visibleChannels: Channel[] = [];
let seriesEpisodes: Channel[] | null = null;
let episodeQueue: Channel[] = [];
let seriesRequest = 0;
let numericZap: NumericZap | null = null;
let zapTimer: ReturnType<typeof setTimeout> | null = null;
const zapOverlay = $("numeric-zap");

function cancelNumericZap(): void {
  if (zapTimer !== null) clearTimeout(zapTimer);
  zapTimer = null;
  numericZap = null;
  zapOverlay.hidden = true;
}

function canNumericZap(): boolean {
  const focused = document.activeElement as HTMLElement | null;
  const dialogOpen = [...document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"], [role="menu"], [role="listbox"]')].some((el) => el.getClientRects().length > 0);
  return !playerBar.hidden && showsChannelList(activeView) &&
    (!isCompact() || playerBar.classList.contains("open")) &&
    !focused?.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])") && !dialogOpen;
}

/**
 * Можно ли обрабатывать горячие клавиши (S — скриншот, ←/→ — перемотка,
 * остальные ниже) в текущем интерфейсе: не в поле ввода, не в модальном
 * диалоге/меню, не на настройках/записях (там свои контролы), не на
 * мини-плеере и не когда панель скрыта.
 */
export let visibleResults: (Channel | ProgrammeMatch)[] = [];

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
let playerSettings = parsePlayerSettings(null);
try {
  playerSettings = parsePlayerSettings(localStorage.getItem(PLAYER_SETTINGS_KEY));
} catch { /* приватный режим: используем дефолты */ }
const playerSettingsForm = $<HTMLFormElement>("player-settings-form");

// ---------- Менеджер плейлистов — UI-слой вынесен в playlist-ui.ts (issue #123) ----------
// Инстанс обязан создаваться до первого топ-уровневого applyLanguage() ниже
// по модулю — иначе TDZ: «Cannot access 'playlistUi' before initialization»
// (поймали визуальные спеки Playwright, tsc это не видит).
const playlistUi = createPlaylistUi({
  nodes: playlistUiNodes,
  storage: typeof localStorage !== "undefined" ? localStorage : null,
  // Счётчик как в списке каналов: с учётом скрытых каналов (#206)
  channelCount: () => (snapshot ? displayChannels().length : null),
  createButton: () => document.createElement("button"),
  language: () => currentLanguage,
  icon: setIcon,
  showSetupError: (message) => {
    if (message) setSystemText(setupError, message);
    setupError.hidden = !message;
  },
  showPlayer,
  activatePlaylist,
  renderSettingsMode,
  stateChanged: (next) => { plState = next; },
});

const groupPreferencesUi = createGroupPreferencesUi({
  list: $("group-preferences"), showAll: $<HTMLButtonElement>("groups-show-all"), resetOrder: $<HTMLButtonElement>("groups-reset-order"),
}, {
  language: () => currentLanguage,
  setVisible: (group, visible) => {
    const hidden = new Set(groupPreferences.hidden);
    if (visible) hidden.delete(group); else hidden.add(group);
    saveGroupPreferences({ ...groupPreferences, hidden });
  },
  move: (group, step) => saveGroupPreferences({ ...groupPreferences, order: moveGroup(snapshot?.categories ?? [], groupPreferences.order, group, step) }),
  showAll: () => saveGroupPreferences({ ...groupPreferences, hidden: new Set() }),
  resetOrder: () => saveGroupPreferences({ ...groupPreferences, order: [] }),
});

// ---------- Транспорт загрузки плейлистов — playlist-transport.ts (issue #123) ----------
// Тоже создаётся до первого топ-уровневого кода ниже по модулю (см. комментарий
// про TDZ выше), но его deps инлайн-функции — краш невозможен по построению.
const playlistOpfsFs = createOpfsFs(typeof navigator !== "undefined" ? navigator.storage : null);
const playlistTransport: Transport = createTransport({
  fs: playlistOpfsFs,
  language: () => currentLanguage,
});
const playerBuffer = $<HTMLInputElement>("player-buffer");
const playerLowLatency = $<HTMLInputElement>("player-low-latency");
const playerDiagnosticsTimeout = $<HTMLInputElement>("player-diagnostics-timeout");
const playerMobileQuality = $<HTMLInputElement>("player-mobile-quality");
const playerMobileHeight = $<HTMLSelectElement>("player-mobile-height");
const playerAutoplayLast = $<HTMLInputElement>("player-autoplay-last");
const playerVolumeBoost = $<HTMLInputElement>("player-volume-boost");
const mobileQualitySupported = getNetworkConnection() !== null;
$("player-mobile-quality-row").hidden = !mobileQualitySupported;
$("player-mobile-height-row").hidden = !mobileQualitySupported;
$("player-mobile-unsupported").hidden = mobileQualitySupported;
const playerSettingsStatus = $("player-settings-status");
function renderPlayerSettings(): void {
  playerBuffer.value = String(playerSettings.maxBufferLength);
  playerLowLatency.checked = playerSettings.lowLatencyMode;
  playerDiagnosticsTimeout.value = String(playerSettings.diagnosticsTimeoutMs / 1000);
  playerMobileQuality.checked = playerSettings.limitMobileQuality;
  playerMobileHeight.value = String(playerSettings.mobileMaxHeight);
  playerAutoplayLast.checked = playerSettings.autoplayLastChannel;
  playerVolumeBoost.checked = playerSettings.volumeBoost;
}
function persistPlayerSettings(): void {
  renderPlayerSettings();
  player.setBoostEnabled(playerSettings.volumeBoost, playerSettings.volumePercent / 100);
  refreshPlayerVolume();
  try {
    localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(playerSettings));
    setSystemText(playerSettingsStatus, t("settings.saved"));
  } catch {
    setSystemText(playerSettingsStatus, t("settings.unsaved"));
  }
}
renderPlayerSettings();
playerSettingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!playerSettingsForm.reportValidity()) return;
  playerSettings = sanitizePlayerSettings({
    maxBufferLength: playerBuffer.valueAsNumber,
    lowLatencyMode: playerLowLatency.checked,
    diagnosticsTimeoutMs: playerDiagnosticsTimeout.valueAsNumber * 1000,
    limitMobileQuality: playerMobileQuality.checked,
    mobileMaxHeight: Number(playerMobileHeight.value),
    autoplayLastChannel: playerAutoplayLast.checked,
    volumeBoost: playerVolumeBoost.checked,
    volumePercent: Math.min(playerVolumeBoost.checked ? 200 : 100, playerSettings.volumePercent),
  });
  persistPlayerSettings();
});
$("player-settings-reset").addEventListener("click", () => {
  playerSettings = { ...DEFAULT_PLAYER_SETTINGS };
  persistPlayerSettings();
});
// Диагностика потока (#116): один раз на канал при фатальной ошибке.
let diagnosticsFor: string | null = null;
async function diagnoseStreamFailure(): Promise<void> {
  const url = player.currentStreamUrl;
  if (!url || url.startsWith("blob:") || diagnosticsFor === url) return;
  diagnosticsFor = url;
  const attempt = currentHealthAttempt();
  const failedAt = attempt ? channelHealth.get(attempt.url)?.failedAt : undefined;
  try {
    const r = await probeStream(url, (u, init) => fetch(u, init), player.diagnosticsTimeoutMs);
    if (attempt && currentHealthAttempt() === attempt && failedAt !== undefined && channelHealth.get(attempt.url)?.failedAt === failedAt) {
      const kind = isMixedContent(window.location.href, attempt.url) ? "mixed-content" : r.kind === "ok" ? "unknown" : r.kind;
      channelHealth = markChannelFailure(channelHealth, attempt.url, { failedAt, kind, ...(r.kind === "http" ? { status: r.status } : {}) });
      persistChannelHealth();
    }
    const verdict = probeVerdict(r);
    const detail =
      r.kind === "blocked" ? corsChecklist() : r.kind === "http" ? httpChecklist(r.status) : "";
    pushNotification(`${verdict}${detail ? `\n${detail}` : ""}`);
    showToast(verdict);
  } catch {
    // диагностика не должна усугублять сбой — молча
  }
}

const player = new Player(
  videoEl,
  showToast,
  () => {
    qualityMenuUi.refreshQualityUi();
    refreshPlayerStatus();
    btnRetry.hidden = true; // поток ожил — retry не нужен
  },
  () => {
    btnRetry.hidden = false; // фатальная ошибка — показываем retry
    noteChannelFailure();
    void diagnoseStreamFailure();
  },
  () => playerSettings,
  () => {
    if (!segSession.isRecording()) return;
    stopRecordingNow();
    showToast(tr("record.mirrorStopped"));
  },
  () => currentLanguage,
);

// Меню качества/дорожек — DOM-слой вынесен в quality-menu.ts (issue #123)
const qualityMenuUi = createQualityMenu({
  language: () => currentLanguage,
  player,
  isRecordingPlayback: () => player.isRecordingPlayback,
  canLoadExternalSubtitles: () => !!player.currentStreamUrl && !playerBar.hidden &&
    (player.isRecordingPlayback || archivePlayback !== null || (Number.isFinite(videoEl.duration) && videoEl.duration > 0)),
  loadExternalSubtitles: () => chooseExternalSubtitles(),
  selectExternalSubtitles: (enabled) => {
    player.setExternalSubtitleEnabled(enabled);
    const subtitle = player.externalSubtitle;
    if (currentRecordingId && subtitle) saveSubtitlePreference(currentRecordingId, subtitle.name, enabled);
  },
  nodes: {
    qualityWrap,
    qualityBtn,
    qualityMenu,
    audioWrap,
    audioBtn,
    audioMenu,
    subtitleWrap,
    subtitleBtn,
    subtitleMenu,
    playerStatus,
  },
  videoSize: () => ({ width: videoEl.videoWidth, height: videoEl.videoHeight }),
  createButton: () => document.createElement("button"),
});

const multiViewUi = createMultiViewUi({
  panel: $("multi-view"),
  language: () => currentLanguage,
  settings: () => playerSettings,
  toast: showToast,
  select: (channel) => {
    archivePlayback = null;
    lastPlayed = channel;
    // Заголовок и звезда следуют за активным окном (#253): раньше здесь
    // менялся только lastPlayed, и заголовок оставался от первого канала.
    refreshNowHeader(channel);
    renderChannels(false);
  },
  playback: (playing) => {
    wakeLockState = playing
      ? wakeLockPlay(wakeLockState, wakeLockHooks, document.visibilityState === "visible")
      : wakeLockStop(wakeLockState);
  },
  exit: () => closeMultiView(true),
  // Восстановление сетки при повторном входе (#254): URL → канал из
  // ТЕКУЩЕГО snapshot с алиасами и скрытием. PIN-каналы нужно выбрать
  // заново через playChannel(), а не запускать без нового подтверждения.
  resolve: (url) => displayChannels().find((c) => c.url === url && !parentalPins.has(c.group)) ?? null,
});

function closeMultiView(resume: boolean): void {
  if (!multiViewUi.isOpen) return;
  const volume = multiViewUi.volume;
  const selected = multiViewUi.close();
  player.setVolume(volume);
  volumeSlider.value = String(volume * 100);
  refreshMuteIcon();
  $("player-stack").hidden = false;
  if (resume && selected) {
    // Возобновление может быть отклонено (PIN, отказ плеера) — тогда
    // играть нечего, и заголовок не должен показывать чужой «текущий» (#253).
    void playChannel(selected).then((played) => {
      if (!played) refreshNowHeader(null);
    });
  } else { playerBar.hidden = true; setWatching(false); }
}

$("btn-multi-view").addEventListener("click", () => {
  if (isCompact()) { showToast(tr("multi.mobile")); return; }
  if (!lastPlayed) { showToast(tr("multi.pickFirst")); return; }
  stopIfRecording();
  saveCurrentPosition();
  const volume = player.getVolume();
  player.stop();
  if (!qualityMenu.hidden) closeOverlay("quality");
  audioMenu.hidden = true;
  subtitleMenu.hidden = true;
  multiViewUi.start(lastPlayed, volume);
  $("player-stack").hidden = true;
});
$("multi-exit").addEventListener("click", () => closeMultiView(true));
$("multi-close").addEventListener("click", () => btnClosePlayer.click());
$("multi-list").addEventListener("click", () => {
  setPanelHidden(false);
  setListCollapsed(false);
  if (!showsChannelList(activeView)) setView("channels");
});
window.addEventListener("resize", () => {
  if (multiViewUi.isOpen && isCompact()) {
    closeMultiView(true);
    showToast(tr("multi.mobile"));
  }
});
window.addEventListener("pagehide", () => closeMultiView(false));

function setSystemText(el: HTMLElement, message: string): void {
  el.dataset.systemMessage = message;
  el.textContent = translateMessage(message, currentLanguage);
}

function applyLanguage(): void {
  document.documentElement.lang = currentLanguage;
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = tr(el.dataset.i18n as TranslationKey);
  }
  for (const attr of ["title", "aria-label", "placeholder"]) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, tr(el.getAttribute(`data-i18n-${attr}`) as TranslationKey));
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-system-message]")) {
    el.textContent = translateMessage(el.dataset.systemMessage!, currentLanguage);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-language]")) {
    const on = b.dataset.language === currentLanguage;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  }
  // Подписи менеджера плейлистов обновляет playlist-ui.ts (editing-строки
  // не пересоздаются — незавершённое редактирование не теряется).
  playlistUi.applyLanguage();
  renderGroupSettings();
  renderPlaylistSwitcher();
  renderSettingsMode();
  renderNav();
  notifBellUi.render();
  reminderUi?.render();
  updateMenuToggle();
  if (multiViewUi.isOpen) multiViewUi.render();
}

$("language-seg").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-language]");
  if (!button) return;
  currentLanguage = button.dataset.language as Language;
  try { localStorage.setItem(LANGUAGE_KEY, currentLanguage); } catch { /* приватный режим */ }
  applyLanguage();
  renderPinSettings();
  renderCategories();
  renderChannels(false);
  renderContinue();
  renderRecordings();
  refreshNowFav();
  renderRecButton(isRecordingNow());
  qualityMenuUi.refreshQualityUi();
  refreshScrub();
  renderSchedule();
  if (!guideOverlay.hidden) renderGuide();
  renderFullscreenTitle();
});

// ---------- UI helpers ----------
// Токен показа: таймер скрытия гасит тост, только если поверх не показали
// новый. Иначе короткий тост («Запись остановлена») уносил с собой кнопку
// скачивания, которая должна жить 15с (issue #58).
let toastToken = 0;

function showToast(msg: string): void {
  const token = ++toastToken;
  setSystemText(toastEl, msg);
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
  delete toastEl.dataset.systemMessage;
  toastEl.textContent = "";
  const span = document.createElement("span");
  setSystemText(span, msg);
  const btn = document.createElement("button");
  btn.className = "toast-action";
  setSystemText(btn, actionLabel);
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

// ---------- Центр уведомлений (#98) — UI-слой вынесен в notification-bell.ts ----------
const notifBellUi = createNotificationBell({
  badge: notifBadge,
  list: notifList,
  storage: typeof localStorage !== "undefined" ? localStorage : null,
  onOpen: () => {
    notifPanel.hidden = false;
    notifBell.setAttribute("aria-expanded", "true");
    overlayStack = pushOverlay(overlayStack, "notifications");
    history.pushState({ overlay: "notifications" }, "");
  },
  onClose: () => closeOverlay("notifications"),
  language: () => currentLanguage,
  onWatch: (target) => { void watchReminder(target); },
});
/** Положить уведомление в колокольчик (данные + бейдж). */
function pushNotification(message: string): void {
  notifBellUi.push(message);
}

async function watchReminder(target: NotificationWatch): Promise<void> {
  const playlist = plState.items.find((p) => p.id === target.playlistId);
  if (!playlist) { showToast(tr("reminder.unavailable")); return; }
  if (plState.activeId !== playlist.id) {
    plState = { ...plState, activeId: playlist.id };
    savePlaylists(localStorage, plState);
    favorites = loadFavoritesFor(playlist.id);
    loadRecentsFor(playlist.id);
    renderSettingsMode();
    await openPlaylist(playlist.playlistUrl, playlist.epgUrl);
  }
  if (plState.activeId !== playlist.id || !snapshot) return;
  const channel = displayChannels().find((c) => c.url === target.channelUrl);
  if (!channel) { showToast(tr("reminder.unavailable")); return; }
  if (await playChannel(channel)) closeOverlay("notifications");
}

notifBell.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = notifPanel.hidden;
  if (willOpen) notifBellUi.open();
  else {
    notifPanel.hidden = true;
    notifBell.setAttribute("aria-expanded", "false");
  }
});

notifClear.addEventListener("click", () => notifBellUi.clear());

document.addEventListener("click", (e) => {
  if (notifPanel.hidden) return;
  if (!notifBell.contains(e.target as Node) && !notifPanel.contains(e.target as Node)) {
    closeOverlay("notifications");
  }
});

notifBellUi.render();
applyLanguage();

function showSetup(message?: string): void {
  setView("settings", false);
  if (message) {
    setSystemText(setupError, message);
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
  setupLoad.textContent = firstRun ? tr("playlist.open") : tr("playlist.addOpen");
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
  label.textContent = translateMessage(view.label, currentLanguage);
  b.append(label);
  b.addEventListener("click", () => {
    if (!isCompact()) setPanelHidden(false);
    setView(view.id);
  });
  return b;
}

function renderNav(): void {
  tabbar.textContent = "";
  sideNav.textContent = "";
  for (const v of VIEWS) {
    if ((v.id === "movies" || v.id === "series") && !activePlaylist(plState)?.xtreamVod) continue;
    tabbar.append(navButton(v, "tab"));
    sideNav.append(navButton(v, "side-item"));
  }
  viewTitle.textContent = translateMessage(VIEWS.find((v) => v.id === activeView)?.label ?? "", currentLanguage);
}

/**
 * Переключить раздел: и экран, и видимость фильтров, и список.
 *
 * `persist: false` — для вынужденных переходов (плейлист не настроен, значит
 * показываем настройки). Такой переход не должен затирать раздел, который
 * пользователь выбрал сам, иначе выбор теряется при каждом пустом старте.
 */
function setView(view: View, persist = true): void {
  if (view !== "series") { seriesEpisodes = null; ++seriesRequest; }
  if ((view === "movies" || view === "series") && !activePlaylist(plState)?.xtreamVod) view = "channels";
  cancelNumericZap();
  activeView = view;
  // Разделы со списком используют раскладку канала рядом с плеером.
  appEl.classList.toggle("channel-view", showsChannelList(view));
  if (persist) {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* приватный режим */
    }
  }
  const settings = view === "settings";
  setupScreen.hidden = !settings;
  // Раздел «Записи» — свой экран; на остальных показывается список каналов.
  playerScreen.hidden = settings || view === "recordings";
  if (settings) {
    setupError.hidden = true;
    renderPlaylistManager();
    renderPlaylistSwitcher();
    renderSettingsMode();
    if (plState.items.length > 0 && !setupError.textContent) setAddFormOpen(false);
    renderThemeSeg();
    renderRefreshSeg();
    renderPinSettings();
    renderGroupSettings();
  }
  renderRecordings();
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
let parentalPins: ParentalPins = new Map();
let playRequest = 0;
const pinDialog = createPinDialog($<HTMLDialogElement>("pin-dialog"), (key) => tr(key));
const pinGroup = $<HTMLSelectElement>("pin-group");
const pinSet = $<HTMLButtonElement>("pin-set");
const pinRemove = $<HTMLButtonElement>("pin-remove");

function renderPinSettings(): void {
  const previous = pinGroup.value;
  pinGroup.replaceChildren(...(snapshot?.categories ?? []).map((group) => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = parentalPins.has(group) ? `${group} · ${tr("pin.protected")}` : group;
    return option;
  }));
  if ([...pinGroup.options].some((option) => option.value === previous)) pinGroup.value = previous;
  pinSet.disabled = pinGroup.options.length === 0 || parentalPins.has(pinGroup.value);
  pinRemove.disabled = !parentalPins.has(pinGroup.value);
}
pinGroup.addEventListener("change", renderPinSettings);

async function authorizeGroup(group: string | null): Promise<boolean> {
  const record = group === null ? undefined : parentalPins.get(group);
  if (!record) { pinDialog.cancel(); return true; }
  return pinDialog.ask(group!, false, (pin) => verifyPin(pin, record));
}

pinSet.addEventListener("click", async () => {
  const id = plState.activeId;
  const group = pinGroup.value;
  if (!id || pinSet.disabled) return;
  const saved = await pinDialog.ask(group, true, async (pin, isCurrent) => {
    const record = await createPinHash(pin);
    if (!isCurrent() || plState.activeId !== id) return false;
    const next = new Map(parentalPins).set(group, record);
    localStorage.setItem(parentalPinsKey(id), serializeParentalPins(next));
    parentalPins = next;
    return true;
  });
  if (!saved || plState.activeId !== id) return;
  // Уже открытый канал не должен продолжать играть после установки защиты.
  if (multiViewUi.isOpen || lastPlayed?.group === group) btnClosePlayer.click();
  if (activeCategory === group) activeCategory = null;
  renderPinSettings();
  renderCategories();
  renderChannels();
});
pinRemove.addEventListener("click", async () => {
  const id = plState.activeId;
  const group = pinGroup.value;
  const record = parentalPins.get(group);
  if (!id || !record) return;
  const removed = await pinDialog.ask(group, false, async (pin, isCurrent) => {
    if (!await verifyPin(pin, record) || !isCurrent() || plState.activeId !== id) return false;
    const next = new Map(parentalPins);
    next.delete(group);
    localStorage.setItem(parentalPinsKey(id), serializeParentalPins(next));
    parentalPins = next;
    return true;
  });
  if (removed) { renderPinSettings(); renderCategories(); }
});

async function selectCategory(value: string | null): Promise<void> {
  if (value !== null && groupPreferences.hidden.has(value)) return;
  const id = plState.activeId;
  if (!await authorizeGroup(value) || plState.activeId !== id) return;
  activeCategory = value;
  catMenu.hidden = true;
  btnCategories.setAttribute("aria-expanded", "false");
  renderCategories();
  renderChannels();
}

const channelEditor = $<HTMLDialogElement>("channel-editor");
channelEditor.addEventListener("keydown", (event) => event.stopPropagation());
const channelAlias = $<HTMLInputElement>("channel-alias");
const channelEpgId = $<HTMLInputElement>("channel-epg-id");
const channelHidden = $<HTMLInputElement>("channel-hidden");
let editedChannelUrl: string | null = null;

function openChannelEditor(channel: Channel): void {
  if (!snapshot) return;
  editedChannelUrl = channel.url;
  const original = snapshot?.channels.find((c) => c.url === channel.url);
  $("channel-original").textContent = original?.name ?? channel.name;
  channelAlias.value = channelOverrides.get(channel.url)?.alias ?? "";
  channelEpgId.value = channelOverrides.get(channel.url)?.epgId ?? "";
  channelHidden.checked = channelOverrides.get(channel.url)?.hidden ?? false;
  channelEditor.showModal();
  channelAlias.focus();
}

function refreshChannelOverrides(): void {
  if (!snapshot) return;
  const nameFor = (channel: Channel): string => {
    const original = snapshot!.channels.find((c) => c.url === channel.url) ?? channel;
    return applyChannelOverrides([original], channelOverrides, true)[0]!.name;
  };
  if (lastPlayed) {
    lastPlayed.name = nameFor(lastPlayed);
    const original = snapshot.channels.find((channel) => channel.url === lastPlayed!.url) ?? lastPlayed;
    lastPlayed.tvgId = applyChannelOverrides([original], channelOverrides, true)[0]!.tvgId;
    refreshNowHeader(lastPlayed);
  }
  multiViewUi.updateNames(nameFor);
  renderCategories();
  renderChannels(false);
  renderPlaylistSwitcher();
}

$("channel-editor-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editedChannelUrl || !plState.activeId) return;
  channelOverrides = setChannelOverride(channelOverrides, editedChannelUrl, channelAlias.value, channelHidden.checked, channelEpgId.value);
  try { localStorage.setItem(channelOverridesKey(plState.activeId), serializeChannelOverrides(channelOverrides)); }
  catch { /* без персистентности сохраняем изменения в текущей сессии */ }
  channelEditor.close();
  refreshChannelOverrides();
});
$("channel-editor-cancel").addEventListener("click", () => channelEditor.close());
$("channel-overrides-reset").addEventListener("click", () => {
  if (!plState.activeId) { showToast(tr("backup.openFirst")); return; }
  channelOverrides = new Map();
  try { localStorage.removeItem(channelOverridesKey(plState.activeId)); } catch { /* текущая сессия */ }
  refreshChannelOverrides();
  showToast(tr("channel.resetDone"));
});

function renderCategories(): void {
  if (!snapshot) return;
  const channels = seriesEpisodes && activeView === "series" ? filterVisibleGroups(applyChannelOverrides(seriesEpisodes, channelOverrides), groupPreferences.hidden) : channelsForView(activeView, displayChannels(), favorites, recents);
  categoriesNav.textContent = "";
  const mk = (label: string, value: string | null, count: number) => {
    const b = document.createElement("button");
    b.textContent = label;
    const n = document.createElement("span");
    n.className = "count";
    n.textContent = String(count);
    b.append(n);
    b.className = chipClass(activeCategory === value);
    if (value !== null && parentalPins.has(value)) b.title = tr("pin.protected");
    b.addEventListener("click", () => { void selectCategory(value); });
    return b;
  };
  const entries: Array<[string, string | null, number]> = [
    [tr("categories.all"), null, channels.length],
    ...orderedGroups([...new Set(channels.map((channel) => channel.group))], groupPreferences.order).filter((g) => !groupPreferences.hidden.has(g)).map(
      (g) =>
        [g, g, channels.filter((c) => c.group === g).length] as [
          string,
          string,
          number,
        ],
    ),
  ];
  categoriesNav.append(...entries.map(([l, v, n]) => mk(l, v, n)));
  if (seriesEpisodes && activeView === "series") {
    const back = document.createElement("button");
    back.className = "chip";
    back.textContent = tr("catalogue.backSeries");
    back.addEventListener("click", () => { seriesEpisodes = null; activeCategory = null; ++seriesRequest; renderCategories(); renderChannels(); });
    categoriesNav.prepend(back);
  }

  // Тот же список пунктами меню — для режима просмотра, где чипов нет.
  catMenu.textContent = "";
  for (const [label, value, count] of entries) {
    const item = document.createElement("button");
    item.className = menuItemClass(activeCategory === value);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(activeCategory === value));
    const name = document.createElement("span");
    name.className = "cat-label";
    name.textContent = label;
    const total = document.createElement("span");
    total.className = "count";
    total.textContent = `(${count})`;
    item.append(name, total);
    if (value !== null && parentalPins.has(value)) item.title = tr("pin.protected");
    item.addEventListener("click", () => { void selectCategory(value); });
    catMenu.append(item);
  }
  const current = entries.find(([, v]) => v === activeCategory);
  btnCategories.textContent = current ? current[0] : tr("categories.all");
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
  const catalogue = (activeView === "movies" || activeView === "series") && !seriesEpisodes;
  const columns = catalogue ? columnsForWidth(channelList.clientWidth, 160) : CHANNEL_COLUMNS;
  const rowHeight = catalogue ? 260 : CHANNEL_ROW_HEIGHT;
  virtualInner.dataset.catalogue = String(catalogue);
  virtualInner.style.gridTemplateColumns = catalogue ? `repeat(${columns}, minmax(0, 1fr))` : "";
  const win = computeWindow(
    channelList.scrollTop,
    vh,
    visibleResults.length,
    rowHeight,
    undefined,
    columns,
  );
  virtualSpacer.style.height = `${spacerHeight(visibleResults.length, rowHeight, columns)}px`;
  virtualInner.style.transform = `translateY(${win.offset}px)`;
  virtualInner.textContent = "";
  const first = win.start * columns;
  const last = Math.min(
    visibleResults.length,
    first + win.count * columns,
  );
  for (let i = first; i < last; i++) {
    const c = visibleResults[i];
    if (c) {
      const row = "programme" in c ? renderProgrammeMatch(c) :
        catalogue ? createCatalogueCard(document, c, () => { void playChannel(c); }) : renderChannelCard(c);
      row.dataset.resultIndex = String(i);
      virtualInner.append(row);
    }
  }
}

// Поворот экрана / resize меняет ширину контейнера (число колонок) и питч —
// пересчитываем окно, иначе спейсер остаётся со старой высотой и карточки
// наезжают друг на друга (issue #62).
window.addEventListener("resize", () => {
  syncStatusBarAppearance();
  if (playerScreen.hidden) return;
  renderVirtualWindow();
});

function renderChannels(resetScroll = true): void {
  if (resetScroll) cancelNumericZap();
  if (!snapshot) return;
  const q = searchInput.value.trim().toLowerCase();
  const channels = displayChannels();
  const inView = activeView === "series" && seriesEpisodes ? filterVisibleGroups(applyChannelOverrides(seriesEpisodes, channelOverrides), groupPreferences.hidden) :
    activeView === "channels" && q && activePlaylist(plState)?.xtreamVod ? channels.filter((channel) => channel.mediaKind !== "episode") :
    channelsForView(activeView, channels, favorites, recents);
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
  const programmes = searchProgrammes(inView.filter((c) => !c.mediaKind && (!activeCategory || c.group === activeCategory)), epg, q);
  visibleResults = [...(activeView === "favorites" ? applyFavoritesOrder(sorted, favorites, favoritesOrder) : sorted), ...programmes];
  visibleChannels = [...new Map([...sorted, ...programmes.map((m) => m.channel)].map((c) => [c.url, c])).values()];
  viewCount.textContent = groupDigits(visibleResults.length);
  emptyState.textContent = emptyMessage(activeView, q !== "", currentLanguage);
  emptyState.hidden = visibleResults.length > 0;
  ensureVirtualShell();
  // при смене фильтра сбрасываем прокрутку, чтобы окно пересчиталось с нуля
  renderContinue();
  if (resetScroll) channelList.scrollTop = 0;
  renderVirtualWindow();
  if (!guideOverlay.hidden && guideGridOn) timelineGuideUi?.refresh();
}

/** Общая плитка: исходный логотип или монограмма, в том числе после ошибки. */
function renderChannelLogo(c: Channel): HTMLSpanElement {
  const logo = document.createElement("span");
  logo.className = "logo sm";
  logo.title = c.name;
  const monogram = c.name.trim().slice(0, 2).toUpperCase();
  logo.textContent = monogram;
  if (c.logo) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => { logo.textContent = monogram; }, { once: true });
    img.src = c.logo;
    logo.textContent = "";
    logo.append(img);
  }
  return logo;
}

/** Результат поиска сохраняет высоту виртуальной строки канала. */
function renderProgrammeMatch(match: ProgrammeMatch): HTMLElement {
  const { channel, programme } = match;
  const row = document.createElement("div");
  row.tabIndex = 0;
  row.className = channelRowClass(lastPlayed?.url === channel.url);
  row.setAttribute("role", "listitem");
  const logo = renderChannelLogo(channel);
  const meta = document.createElement("span");
  meta.className = "meta";
  const name = document.createElement("span");
  name.className = "t-strong ellipsis";
  name.textContent = `${channel.name} · ${programme.title}`;
  const time = document.createElement("span");
  time.className = "row-now ellipsis muted num";
  const date = new Date(programme.start).toLocaleDateString(currentLanguage, { day: "2-digit", month: "2-digit" });
  time.textContent = `${date} · ${formatRange(programme, currentLanguage)}`;
  meta.append(name, time);
  row.append(logo, meta);
  row.title = `${name.textContent} · ${time.textContent}`;
  row.addEventListener("click", async () => {
    const archive = programmeArchiveUrl(match);
    const played = await playChannel(channel, archive ?? undefined, programme);
    if (played && !archive && Date.parse(programme.start) > Date.now()) {
      showToast(tr("guide.futureLive"));
    }
  });
  row.addEventListener("keydown", (event) => {
    if (event.target === row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); row.click(); }
  });
  const reminder = plState.activeId && reminderUi?.button(channel, programme, plState.activeId);
  if (reminder) {
    row.classList.add("programme-result");
    row.append(reminder);
  }
  return row;
}

function renderChannelCard(c: Channel): HTMLElement {
  // Карточка — контейнер, а не кнопка (#351): запуск канала — растянутая на
  // всю строку кнопка .channel-hit, звезда и редактирование — соседние кнопки
  // поверх неё. Так нет вложенных интерактивных элементов, а клик по любой
  // точке строки по-прежнему запускает канал.
  const card = document.createElement("div");
  card.className = channelRowClass(lastPlayed?.url === c.url);
  card.setAttribute("role", "listitem");
  card.dataset.channelUrl = c.url; // для клавиатурной навигации (FR-8)
  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "channel-hit";
  hit.setAttribute("aria-label", c.name);
  hit.title = c.url; // ссылка на поток при наведении
  card.append(hit);
  if (activeView === "favorites") {
    card.draggable = true;
    hit.title = tr("favorites.reorderHint");
    hit.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
    hit.addEventListener("keydown", (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const channels = visibleResults.filter((row): row is Channel => !("programme" in row));
      const index = channels.findIndex((channel) => channel.url === c.url);
      const target = channels[index + (event.key === "ArrowUp" ? -1 : 1)];
      if (target) reorderFavorite(c.url, target.url);
    });
    card.addEventListener("dragstart", (event) => {
      if (!event.dataTransfer || event.target !== card) { event.preventDefault(); return; }
      event.dataTransfer.setData("application/x-iptv-favorite", JSON.stringify({ playlistId: plState.activeId, url: c.url }));
      event.dataTransfer.effectAllowed = "move";
      cancelNumericZap();
    });
    card.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("application/x-iptv-favorite")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      card.classList.add("favorite-drop-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("favorite-drop-target"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("favorite-drop-target");
      try {
        const data = JSON.parse(event.dataTransfer?.getData("application/x-iptv-favorite") ?? "null");
        if (data?.playlistId === plState.activeId && typeof data.url === "string") reorderFavorite(data.url, c.url);
      } catch { /* Чужой drag payload. */ }
    });
    card.addEventListener("dragend", () => {
      channelList.querySelectorAll(".favorite-drop-target").forEach((row) => row.classList.remove("favorite-drop-target"));
    });
  }
  const failure = channelHealth.get(c.url);
  card.classList.toggle("has-failure", failure !== undefined);

  card.append(renderChannelLogo(c));

  const meta = document.createElement("span");
  meta.className = "meta";
  const line = document.createElement("span");
  line.className = "line";

  const name = document.createElement("span");
  name.className = "t-strong ellipsis";
  name.textContent = c.name;
  line.append(name);

  if (failure) {
    const badge = document.createElement("span");
    badge.className = "channel-failure";
    badge.textContent = "!";
    badge.title = channelFailureLabel(failure);
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", badge.title);
    line.append(badge);
  }

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
      t.textContent = clock(Date.parse(now.start), currentLanguage);
      e.append(t, ` ${now.title}`);
      meta.append(e);

      const bar = document.createElement("span");
      bar.className = "prog";
      const fill = document.createElement("span");
      fill.style.width = `${(programmeProgress(Date.now(), Date.parse(now.start), Date.parse(now.stop)) * 100).toFixed(1)}%`;
      bar.append(fill);
      meta.append(bar);
    }
    if (next) nextText = `${clock(Date.parse(next.start), currentLanguage)}  ${next.title}`;
  }
  card.append(meta);

  const nextEl = document.createElement("span");
  nextEl.className = "row-next ellipsis muted num";
  nextEl.textContent = nextText;
  card.append(nextEl);

  const star = document.createElement("button");
  const fav = isFavorite(favorites, c);
  star.className = starClass(fav);
  star.title = fav ? tr("favorites.remove") : tr("favorites.add");
  star.setAttribute("aria-label", star.title);
  setIcon(star, fav ? "star-on" : "star");
  star.addEventListener("click", (ev) => {
    ev.stopPropagation(); // не запускать воспроизведение
    favorites = toggleFavorite(favorites, c);
    if (plState.activeId) saveFavoritesFor(plState.activeId);
    refreshNowFav();
    renderCategories();
    renderChannels(false); // звезда не сбрасывает прокрутку (#349)
  });
  const actions = document.createElement("span");
  actions.className = "channel-actions";
  const edit = document.createElement("button");
  edit.className = "icon-btn";
  edit.dataset.channelEdit = "";
  edit.title = tr("channel.edit");
  edit.setAttribute("aria-label", edit.title);
  setIcon(edit, "edit");
  edit.addEventListener("click", (event) => { event.stopPropagation(); openChannelEditor(c); });
  actions.append(star, edit);
  card.append(actions);
  card.addEventListener("contextmenu", (event) => { event.preventDefault(); openChannelEditor(c); });

  // Мини-превью: текстовый тост «сейчас в эфире» (issue #118). Никаких
  // <video> — десяток одновременных декодеров убил бы мобильную батарею.
  let pressT = 0;
  let pressX = 0;
  let pressY = 0;
  const showPreview = (): void => {
    if (!epg) return; // без телепрограммы превью не из чего собрать
    const { now } = getNowNext(epg, c, snapshot!);
    if (!now) return;
    showToast(tr("guide.preview", { channel: c.name, title: now.title, time: clock(Date.parse(now.start), currentLanguage) }));
  };
  card.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "touch") {
      pressT = Date.now();
      pressX = ev.clientX;
      pressY = ev.clientY;
    }
  });
  card.addEventListener("pointerup", (ev) => {
    if (ev.pointerType !== "touch" || pressT === 0) return;
    const held = Date.now() - pressT;
    pressT = 0;
    const moved = Math.hypot(ev.clientX - pressX, ev.clientY - pressY);
    if (isLongPress(held, moved)) {
      ev.preventDefault();
      showPreview();
    }
  });
  card.addEventListener("pointercancel", () => {
    pressT = 0;
  });
  // Мышь: обычный hover по карточке — на десктопе превью ничего не стоит.
  card.addEventListener("mouseenter", () => {
    if (window.matchMedia("(hover: hover)").matches) showPreview();
  });

  card.addEventListener("click", () => playChannel(c));
  return card;
}

// ---------- Плеер ----------
async function playChannel(c: Channel, archiveUrl?: string, archiveProgramme?: EpgProgramme, fromStart = false): Promise<boolean> {
  if (c.mediaKind === "series") {
    const request = ++seriesRequest;
    const playlist = activePlaylist(plState);
    if (!playlist?.xtreamVod || groupPreferences.hidden.has(c.group)) return false;
    showToast(tr("catalogue.episodes"));
    try {
      const episodes = await playlistTransport.loadSeries(playlist.playlistUrl, c);
      if (request !== seriesRequest || plState.activeId !== playlist.id) return false;
      seriesEpisodes = episodes;
      episodeQueue = episodes;
      snapshot = snapshot ? { ...snapshot, channels: [...snapshot.channels.filter((item) => item.mediaKind !== "episode" || item.seriesId !== c.seriesId), ...episodes] } : null;
      searchInput.value = "";
      activeCategory = null;
      setView("series");
      const resume = resumeEpisode(episodes, recents);
      return resume ? playChannel(resume) : false;
    } catch (error) { if (request === seriesRequest) showToast(error instanceof Error ? error.message : tr("error.xtreamResponse")); return false; }
  }
  cancelNumericZap();
  const request = ++playRequest;
  ++seriesRequest;
  if (c.mediaKind !== "episode") episodeQueue = [];
  const id = plState.activeId;
  c = applyChannelOverrides([snapshot?.channels.find((original) => original.url === c.url) ?? c], channelOverrides, true)[0]!;
  if (groupPreferences.hidden.has(c.group)) { showToast(tr("groups.hidden")); return false; }
  if (!await authorizeGroup(c.group) || request !== playRequest || plState.activeId !== id) return false;
  if (multiViewUi.isOpen && (archiveUrl !== undefined || c.mediaKind)) closeMultiView(false);
  // Смена канала во время записи: сохраняем записанный кусок старого канала.
  // lastPlayed может быть null (плеер закрыли сразу после старта записи —
  // осиротевший асинхронный старт): такую запись тоже останавливаем, иначе
  // индикатор записи загорится для нового канала, куда она не относится (#342).
  if (isRecordingNow() && (lastPlayed === null || lastPlayed.url !== c.url || archiveUrl !== undefined || archivePlayback !== null)) {
    stopRecordingNow();
    showToast(tr("record.channelStopped"));
  }
  saveCurrentPosition();
  archivePlayback = archiveUrl === undefined ? null : { url: archiveUrl, programme: archiveProgramme ?? null, fromStart };
  lastPlayed = c;
  if (multiViewUi.isOpen) {
    multiViewUi.play(c);
    rememberRecent(c);
    return true;
  }
  refreshNowHeader(c, archiveUrl); // единая точка обновления заголовка (#253)
  playerBar.hidden = false;
  setWatching(true);
  setIcon(btnPause, "pause"); // после play() обычно идёт воспроизведение
  playerStatus.textContent = "";
  btnRetry.hidden = true; // новый канал — сбрасываем retry-статус
  healthAttempt = !c.mediaKind && archiveUrl === undefined && plState.activeId ? { playlistId: plState.activeId, url: c.url } : null;
  diagnosticsFor = null;
  const refused = player.play(archiveUrl ? { ...c, url: archiveUrl, mirrors: undefined } : c);
  currentRecordingId = null;
  refreshPlaybackControls();
  if (refused) {
    showToast(refused);
    return false;
  }
  // В «Недавние» — только реально запущенное: отказ плеера (DASH и т.п.)
  // просмотром не считается (#356).
  rememberRecent(c);
  // уровни/дорожки приходят асинхронно после парсинга манифеста
  qualityMenuUi.refreshQualityUi();
  renderChannels(false); // подсветка активного без сброса позиции
  return true;
}

/** recents: дедап по url, максимум RECENTS_MAX, хранение per-плейлист. */
function rememberRecent(c: Channel): void {
  recents = pushRecent(recents, c.url);
  if (!plState.activeId) return;
  try {
    localStorage.setItem(recentsKey(plState.activeId), JSON.stringify(recents));
  } catch { /* приватный режим */ }
  // Раздел «Недавние» показывает этот список — обновляем, если он открыт.
  if (activeView === "recents") renderChannels(false);
}

/** Переключить на соседний канал в текущем видимом списке (с зацикливанием). */
function playNeighbor(step: 1 | -1): void {
  if (visibleChannels.length === 0) return;
  const cur = visibleChannels.findIndex((c) => c.url === lastPlayed?.url);
  const from = cur >= 0 ? cur : step === 1 ? -1 : 0;
  const idx = neighborIndex(from, visibleChannels.length, step);
  if (idx !== null) playChannel(visibleChannels[idx]!);
}

let lastPlayed: Channel | null = null;

btnClosePlayer.addEventListener("click", () => {
  ++seriesRequest;
  healthAttempt = null;
  cancelNumericZap();
  playRequest++;
  pinDialog.cancel();
  closeMultiView(false);
  if (isRecordingNow()) {
    stopRecordingNow(); // закрытие плеера — тоже сохраняем записанное
    showToast(tr("record.closedStopped"));
  }
  if (document.fullscreenElement) void document.exitFullscreen();
  saveCurrentPosition();
  player.stop();
  playerBar.hidden = true;
  setWatching(false);
  lastPlayed = null;
  archivePlayback = null;
  renderChannels();
});

btnPause.addEventListener("click", () => {
  player.togglePause();
});
// Wake Lock (FR-7): пока играет и вкладка видима — экран не гаснет.
  videoEl.addEventListener("play", () => {
    wakeLockState = wakeLockPlay(wakeLockState, wakeLockHooks, document.visibilityState === "visible");
    setIcon(btnPause, "pause");
  });
  videoEl.addEventListener("pause", () => {
    wakeLockState = wakeLockStop(wakeLockState);
    setIcon(btnPause, "play");
  });
  document.addEventListener("visibilitychange", () => {
    wakeLockState =
      document.visibilityState === "visible"
        ? wakeLockVisible(wakeLockState, wakeLockHooks)
        : wakeLockHidden(wakeLockState);
  });
videoEl.addEventListener("loadedmetadata", () => {
  // нативный playback: разрешение становится известно здесь —
  // статус в этом случае строит qualityMenuUi (см. refreshQualityUi, no-hls ветка)
  if (videoEl.videoWidth) qualityMenuUi.refreshQualityUi();
  refreshPlayerStatus();
  // Продолжение с последней позиции (FR-9): только неэфирный контент —
  // у живого потока длительность конечного файла нет.
  const dur = videoEl.duration;
  if (lastPlayed && !archivePlayback?.fromStart && Number.isFinite(dur) && dur > 0) {
    const saved = loadPosition(localStorage, archivePlayback?.url ?? lastPlayed.url, Date.now(), dur);
    if (saved !== null && saved > 15) {
      videoEl.currentTime = saved;
      showToast(tr("player.resume", { time: `${Math.floor(saved / 60)}:${String(Math.floor(saved % 60)).padStart(2, "0")}` }));
    }
  }
});

// Позиция сохраняется на pause, перед сменой канала и перед выгрузкой страницы.
const saveCurrentPosition = (): void => {
  const dur = videoEl.duration;
  if (!lastPlayed || !Number.isFinite(dur) || dur === 0) return; // эфир — не сохраняем
  if (videoEl.currentTime > 0) savePosition(localStorage, archivePlayback?.url ?? lastPlayed.url, videoEl.currentTime, Date.now());
};
videoEl.addEventListener("pause", saveCurrentPosition);
window.addEventListener("pagehide", saveCurrentPosition);
// Закрытие/перезагрузка вкладки во время записи: финализируем частичную
// запись в библиотеку, чтобы уже полученные сегменты не остались лежать
// как rec-*.part (и перекодирующая запись не потерялась целиком).
// OPFS-записи при выгрузке браузер не гарантирует — это best effort.
window.addEventListener("pagehide", () => {
  if (isRecordingNow()) stopRecordingNow();
});

btnPrev.addEventListener("click", () => playNeighbor(-1));
btnNext.addEventListener("click", () => playNeighbor(1));

/**
 * Применить действие медиа-клавиши (гарнитура, пульт, мультимедийная
 * клавиатура). Смена канала — как у кнопок деки: во время просмотра записи
 * prev/next скрыты и disabled, поэтому и клавиши ничего не делают.
 */
function applyMediaKey(action: MediaKeyAction): void {
  switch (action) {
    case "play":
      if (videoEl.paused) player.togglePause();
      break;
    case "pause":
      if (!videoEl.paused) player.togglePause();
      break;
    case "toggle":
      player.togglePause();
      break;
    case "forward":
      player.seekBy(15);
      break;
    case "backward":
      player.seekBy(-15);
      break;
    case "next":
      if (!player.isRecordingPlayback) playNeighbor(1);
      break;
    case "previous":
      if (!player.isRecordingPlayback) playNeighbor(-1);
      break;
  }
}

// Живой эфир перематывается только в пределах локального буфера.
btnSeekBack.addEventListener("click", () => player.seekBy(-15));
btnSeekFwd.addEventListener("click", () => player.seekBy(15));

// Ручной перезапуск потока после фатальной ошибки
btnRetry.addEventListener("click", () => {
  diagnosticsFor = null;
  btnRetry.hidden = true;
  player.retry();
  showToast(tr("player.restarting"));
});

btnMute.addEventListener("click", () => {
  player.toggleMute();
  refreshPlayerVolume();
});
volumeSlider.addEventListener("input", () => {
  setPlayerVolume(Number(volumeSlider.value) / 100);
});

function refreshPlayerVolume(): void {
  volumeSlider.max = player.canBoostVolume ? "200" : "100";
  volumeSlider.value = String(Math.round(player.getVolume() * 100));
  volumeSlider.setAttribute("aria-valuetext", `${volumeSlider.value}%`);
  volumeSlider.title = `${volumeSlider.value}%`;
  volumeSlider.classList.toggle("volume-boosting", player.getVolume() > 1);
  refreshMuteIcon();
}
function setPlayerVolume(value: number): void {
  player.setVolume(value);
  playerSettings = sanitizePlayerSettings({ ...playerSettings, volumePercent: Math.round(player.getVolume() * 100) });
  try { localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(playerSettings)); } catch { /* приватный режим */ }
  refreshPlayerVolume();
}

btnPip.addEventListener("click", () => void player.togglePip());

// Клик по самому видео — пауза/продолжить (стандарт видеоплееров)
videoEl.addEventListener("click", () => {
  if (playerBar.hidden) return;
  player.togglePause();
});

// Звезда избранного в плеер-баре (синхронизирована со списком)
function refreshNowFav(): void {
  if (!lastPlayed) {
    // Канала нет (пустое окно в мульти-вью, запись) — звезда не должна
    // помнить прошлый канал (#253).
    setIcon(nowFav, "star");
    nowFav.classList.remove("active");
    nowFav.title = tr("favorites.add");
    return;
  }
  const fav = isFavorite(favorites, lastPlayed);
  setIcon(nowFav, fav ? "star-on" : "star");
  nowFav.classList.toggle("active", fav);
  nowFav.title = fav ? tr("favorites.remove") : tr("favorites.add");
  nowFav.setAttribute("aria-label", nowFav.title);
}
/** Обновить заголовок плеера под текущий канал — одна функция для
 *  одиночного воспроизведения, архива, алиасов и выбора окна в мульти-вью
 *  (#253). Вызывающий обязан уже записать канал в lastPlayed. */
function refreshNowHeader(channel: Channel | null, archiveUrl?: string): void {
  const header = nowHeaderFor(channel, archiveUrl);
  delete nowTitle.dataset.systemMessage;
  delete playerStatus.dataset.systemMessage;
  nowTitle.textContent = header.title;
  nowTitle.title = header.href;
  nowCategory.textContent = header.category;
  refreshNowFav();
}

nowFav.addEventListener("click", () => {
  if (!lastPlayed) return;
  favorites = toggleFavorite(favorites, lastPlayed);
  if (plState.activeId) saveFavoritesFor(plState.activeId);
  refreshNowFav();
  renderChannels(false);
});

// ---------- Клавиатурная навигация по списку каналов (FR-8) ----------
// ↑/↓ — перемещение, Home/End — края, Enter — включить. Работает, когда
// фокус уже на карточке канала (карточки — кнопки) или на поиске.
// Математика фокуса — чистый модуль kbd-nav.ts.
function focusedChannelIndex(): number {
  const t = document.activeElement;
  if (!(t instanceof HTMLElement)) return -1;
  // Фокус живёт на .channel-hit внутри строки (#351) или на самой строке передачи.
  const index = t.closest<HTMLElement>("[data-result-index]")?.dataset.resultIndex;
  return index === undefined ? -1 : Number(index);
}

function focusChannelAt(index: number): void {
  if (!visibleResults[index]) return;
  const catalogue = (activeView === "movies" || activeView === "series") && !seriesEpisodes;
  const columns = catalogue ? columnsForWidth(channelList.clientWidth, 160) : CHANNEL_COLUMNS;
  channelList.scrollTop = Math.floor(index / columns) * (catalogue ? 260 : CHANNEL_ROW_HEIGHT);
  renderVirtualWindow();
  const row = channelList.querySelector<HTMLElement>(`[data-result-index="${index}"]`);
  (row?.querySelector<HTMLElement>(".channel-hit") ?? row)?.focus();
}

window.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA";
  if (typing) {
    // Из поиска: ↓ уводит фокус в список — продолжить набор можно по «/».
    // Отложенный рендер поиска применяем сразу, чтобы список был актуален.
    if (e.key === "ArrowDown" && t === searchInput) searchRender.flush();
    if (e.key === "ArrowDown" && visibleResults.length > 0) {
      e.preventDefault();
      focusChannelAt(firstFocus(visibleResults.length)!);
    }
    return;
  }
  if (playerBar.hidden === false) return; // на странице плеера — свои стрелки
  const cur = focusedChannelIndex();
  if (cur < 0 && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  switch (e.key) {
    case "ArrowDown": {
      e.preventDefault();
      const next = cur < 0 ? firstFocus(visibleResults.length) : moveFocus(visibleResults.length, cur, 1);
      if (next !== null) focusChannelAt(next);
      break;
    }
    case "ArrowUp": {
      e.preventDefault();
      const prev = moveFocus(visibleResults.length, cur, -1);
      if (prev !== null) focusChannelAt(prev);
      break;
    }
    case "Home":
      e.preventDefault();
      focusChannelAt(firstFocus(visibleResults.length)!);
      break;
    case "End":
      e.preventDefault();
      focusChannelAt(lastFocus(visibleResults.length)!);
      break;
    case "Enter":
      // Карточка — <button>: Enter сработает сам; здесь ничего не делаем.
      break;
  }
});

// Горячие клавиши (когда фокус не в инпуте)
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && numericZap) {
    e.preventDefault();
    cancelNumericZap();
    return;
  }
  if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && canNumericZap()) {
    e.preventDefault();
    if (zapTimer !== null) clearTimeout(zapTimer);
    numericZap = appendZapDigit(numericZap, e.key, Date.now());
    zapOverlay.textContent = numericZap!.digits;
    zapOverlay.hidden = false;
    zapTimer = setTimeout(() => {
      const allowed = canNumericZap();
      const index = allowed ? zapChannelIndex(numericZap!.digits, visibleChannels.length) : null;
      cancelNumericZap();
      if (!allowed) return;
      if (index === null) showToast(t("zap.outOfRange", currentLanguage));
      else if (visibleChannels[index]!.url !== lastPlayed?.url) void playChannel(visibleChannels[index]!);
    }, ZAP_DELAY_MS);
    return;
  }
  // Медиа-клавиши (issue #392) работают глобально, пока плеер открыт, —
  // в том числе при фокусе в полях ввода: аппаратные медиа-клавиши не вводят
  // текст, и в этом их смысл. Закрытый плеер значит «управлять нечем».
  if (!playerBar.hidden) {
    const action = mediaKeyAction(e.code);
    if (action) {
      e.preventDefault();
      applyMediaKey(action);
      return;
    }
  }

  const target = e.target as HTMLElement | null;
  const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

  // «/» — поиск. Проверяем code, а не key: в русской раскладке на этой
  // клавише другой символ, а палец жмёт ту же кнопку.
  if (e.code === "Slash" && !typing && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  // Горячие клавиши S (скриншот) и ←/→ (перемотка ±15 с) охраняются
  // чистым canHotkey(): не срабатывают в полях ввода, в диалогах/меню,
  // на настройках, при записи и на мини-плеере со скрытой панелью.
  // Остальные горячие клавиши (G, C, M, J, L, F) обрабатываются ниже.
  if (
    canHotkey({
      playerBar,
      activeView,
      isCompact,
      showsChannelList,
    })
  ) {
    if (e.key.toLowerCase() === "s" || e.key.toLowerCase() === "ы") {
      if (playerBar.hidden) return;
      try {
        takeScreenshot();
      } catch {
        showToast(describeShotFailure("tainted"));
      }
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Стрелки: перемотка ±15 сек. На эфире цель ищется в buffered
      // (можно перематывать в пределах буфера), в записи и VOD — по длине.
      e.preventDefault();
      player.seekBy(e.key === "ArrowLeft" ? -15 : 15);
      return;
    }
  }

  if (typing) return;
  if (!isCompact() && (e.key === "c" || e.key === "с")) {
    e.preventDefault();
    if (appEl.classList.contains("panel-hidden")) setPanelHidden(false);
    else setListCollapsed(!appEl.classList.contains("list-collapsed"));
    return;
  }
  if (playerBar.hidden) return;
  if (multiViewUi.isOpen && multiViewUi.handleKey(e)) return;
  switch (e.key) {
    case " ":
      e.preventDefault();
      player.togglePause();
      break;
    case "ArrowRight":
      e.preventDefault();
      player.seekBy(15);
      break;
    case "ArrowLeft":
      e.preventDefault();
      player.seekBy(-15);
      break;
    case "ArrowUp":
      e.preventDefault();
      volumeSlider.value = String(
        Math.min(Number(volumeSlider.max), Number(volumeSlider.value) + 10),
      );
      setPlayerVolume(Number(volumeSlider.value) / 100);
      break;
    case "ArrowDown":
      e.preventDefault();
      volumeSlider.value = String(
        Math.max(0, Number(volumeSlider.value) - 10),
      );
      setPlayerVolume(Number(volumeSlider.value) / 100);
      break;
    case "Escape": {
      const top = topOverlay(overlayStack);
      if (top !== null) {
        e.preventDefault();
        closeOverlay(top);
        break;
      }
      if (playerBar.classList.contains("open")) {
        e.preventDefault();
        togglePlayerPage(false);
      }
      break;
    }
    case "g":
    case "п": // ru-раскладка
      e.preventDefault();
      if (guideOverlay.hidden) openGuide();
      else guideOverlay.hidden = true;
      break;
    case "c":
    case "с": // ru-раскладка
      if (!showsChannelList(activeView)) return;
      // На узком экране возвращаем список из страницы плеера.
      e.preventDefault();
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

/** Плашка «Эфир» + статус-бар. DOM-логика статуса — в quality-menu.ts. */
function refreshPlayerStatus(): void {
  // Плашка «Эфир» — для живого потока: у него нет конечной длительности.
  const live = !Number.isFinite(videoEl.duration) || videoEl.duration === 0;
  liveBadge.hidden = !live || videoEl.readyState === 0;
  refreshScrub();
  qualityMenuUi.refreshPlayerStatus();
}

/** Остановить запись, если идёт (с сохранением). Вызывается при смене плейлиста. */
function stopIfRecording(): void {
  if (isRecordingNow()) {
    stopRecordingNow();
    showToast(tr("record.playlistStopped"));
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
    recordPathNote = audio > 0 ? tr("record.withAudio") : tr("record.noAudio");
    return { stream };
  } catch (e) {
    console.debug("[iptv-hub] rec: захват с <video> не удался:", e);
    return null;
  }
}

/**
 * Аудиодорожка текущего видео через Web Audio — так звук добывается там, где
 * захват элемента не работает (мобильный Firefox).
 *
 * null означает, что звука не будет: нет Web Audio, либо поток кросс-доменный
 * без CORS — тогда граф по стандарту отдаёт тишину. Для HLS через hls.js это
 * не проблема: источник элемента — свой blob: от MediaSource.
 */
function captureAudioTrack(): { track: MediaStreamTrack; release: () => void } | null {
  return player.captureAudioTrack();
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
      tr("record.noFrames"),
    );
  };
  window.setTimeout(probeCanvas, 1000);

  const audio = withAudio ? captureAudioTrack() : null;
  if (audio) stream.addTrack(audio.track);
  recordPathNote = audio
    ? tr("record.fallbackAudio")
    : tr("record.fallbackSilent");
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
// ---------- Библиотека записанных эфиров (#159) ----------
// Готовая запись сохраняется в OPFS + метаданные в localStorage; список
// показывается в блоке «Записанные эфиры» (рядом с «Продолжить»), клик —
// воспроизведение из приложения. Скачивание — кнопкой в карточке.
let recordingsFs: RecordingsFs | null = null;
let currentRecordingId: string | null = null;
let subtitleRequest = 0;
const recordingSubtitles = new Map<string, { name: string; cues: SubtitleCue[] }>();

function saveSubtitlePreference(id: string, name: string, enabled: boolean): void {
  try { localStorage.setItem(subtitlePreferenceKey(id), JSON.stringify({ name, enabled })); }
  catch { /* Выбранная дорожка остаётся в памяти. */ }
}

function chooseExternalSubtitles(recording?: RecordingMeta): void {
  const request = ++subtitleRequest;
  const source = player.currentStreamUrl;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".srt,.vtt";
  input.hidden = true;
  input.dataset.externalSubtitles = "";
  document.body.append(input);
  input.addEventListener("cancel", () => input.remove(), { once: true });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    void (async () => {
      const cues = /\.(srt|vtt)$/i.test(file.name) ? parseExternalSubtitles(await file.text()) : [];
      if (request !== subtitleRequest || source !== player.currentStreamUrl) return;
      if (!cues.length) { showToast(tr("player.subtitlesInvalid")); return; }
      if (recording) {
        const media = await recordingsFs?.read(storedRecordingName(recording.id, recording.ext));
        if (request !== subtitleRequest || source !== player.currentStreamUrl || !loadRecordings(localStorage).some((item) => item.id === recording.id)) return;
        if (!media) { showToast(tr("error.recordMissing")); return; }
        playRecording(media, recording);
      } else if (source !== player.currentStreamUrl || !source) return;
      const id = recording?.id ?? (player.isRecordingPlayback ? currentRecordingId : null);
      player.loadExternalSubtitles(cues, file.name);
      if (id) {
        recordingSubtitles.set(id, { name: file.name, cues });
        saveSubtitlePreference(id, file.name, true);
      }
      qualityMenuUi.refreshQualityUi();
    })().catch(() => { if (request === subtitleRequest) showToast(tr("player.subtitlesInvalid")); });
  }, { once: true });
  input.click();
}
try {
  recordingsFs = createRecordingsFs();
} catch {
  recordingsFs = null;
}

// Запись, брошенная закрытием вкладки до сохранения, переносится из
// рабочего rec-*.part в библиотеку на следующем запуске (#309).
if (recordingsFs) {
  void recoverPendingRecording({
    kv: typeof localStorage !== "undefined" ? localStorage : null,
    fs: recordingsFs,
    listWork: () => listOpfsNames("rec-"),
    now: Date.now,
    makeId: () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  })
    .then((meta) => {
      if (!meta) return;
      renderRecordings();
      showToast(tr("record.recovered", { channel: meta.channelName }));
    })
    .catch((e: unknown) => console.debug("[iptv-hub] записи: восстановление не удалось", e));
}

/** Момент старта текущей записи (мс эпохи) — выставляется в startRecording. */
let recordingStartedAt = 0;
let recordingChannel: Channel | null = null;
let recordingProgrammeTitle: string | null = null;

/** Передача, идущая в момент записи (для подписи в библиотеке). */
function currentProgrammeTitle(): string | null {
  const all = channelProgrammes();
  const now = Date.now();
  const cur = all.find(
    (p) => Date.parse(p.start) <= now && now < Date.parse(p.stop),
  );
  return cur?.title ?? null;
}

async function saveToLibrary(blob: Blob, ext: string, _mime: string): Promise<void> {
  if (!recordingsFs) {
    // OPFS нет — прежнее поведение: сразу скачивание.
    offerDownload(blob, recordingFileName(recordingChannel?.name ?? "recording"));
    return;
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const meta: RecordingMeta = {
    id,
    channelName: recordingChannel?.name ?? tr("record.defaultName"),
    channelUrl: recordingChannel?.url ?? "",
    programmeTitle: recordingProgrammeTitle,
    startedAt: recordingStartedAt || Date.now(),
    durationSec: recordedDurationSec,
    sizeBytes: blob.size,
    ext,
  };
  try {
    await recordingsFs.write(storedRecordingName(id, ext), blob);
    addRecording(typeof localStorage !== "undefined" ? localStorage : null, meta);
    clearRecordingPending(typeof localStorage !== "undefined" ? localStorage : null);
    renderRecordings();
    // Файл и в библиотеке, и в загрузках: сырой .ts браузерный <video>
    // играть не умеет (только через MSE), поэтому прежнее скачивание —
    // не опция, а необходимость.
    offerDownload(blob, recordingFileName(meta.channelName, new Date(meta.startedAt), ext));
  } catch (e) {
    console.debug("[iptv-hub] записи: не удалось сохранить в библиотеку, скачиваю", e);
    offerDownload(blob, recordingFileName(meta.channelName)); // откат — скачивание
  }
}

/** Секунды фактической записи: от старта до остановки. */
let recordedDurationSec = 0;
function noteRecordingStart(): void {
  recordingChannel = lastPlayed;
  recordingProgrammeTitle = currentProgrammeTitle();
  recordingStartedAt = Date.now();
  recordedDurationSec = 0;
}
function noteRecordingStop(): void {
  if (recordingStartedAt) {
    recordedDurationSec = Math.max(0, (Date.now() - recordingStartedAt) / 1000);
  }
}

function renderRecordings(): void {
  scheduleUi?.render();
  refreshDownloadUi();
  const list = loadRecordings(typeof localStorage !== "undefined" ? localStorage : null);
  // Раздел «Записи» — самостоятельный экран из сайдбара (см. VIEWS).
  const recordingsScreen = $("recordings-screen");
  recordingsScreen.hidden = activeView !== "recordings";
  const empty = $("recordings-empty");
  empty.hidden = list.length > 0;
  const row = $("recordings-list");
  row.textContent = "";
  if (activeView !== "recordings") return;
  for (const r of list) {
    const card = document.createElement("div");
    card.className = "recording-card";
    const play = document.createElement("button");
    play.type = "button";
    play.className = "recording-play";
    const when = new Date(r.startedAt);
    card.title = `${r.channelName} · ${when.toLocaleString(currentLanguage)} · ${formatDuration(r.durationSec)}`;

    const name = document.createElement("span");
    name.className = "recording-name ellipsis";
    name.textContent = r.programmeTitle ?? r.channelName;
    play.append(name);

    const sub = document.createElement("span");
    sub.className = "recording-sub muted num";
    sub.textContent = `${r.channelName} · ${when.toLocaleDateString(currentLanguage)} ${when.toLocaleTimeString(currentLanguage, { hour: "2-digit", minute: "2-digit" })} · ${formatDuration(r.durationSec)} · ${formatBytes(r.sizeBytes)}`;
    play.append(sub);
    card.append(play);

    // Клик — воспроизведение из OPFS.
    play.addEventListener("click", () => {
      if (!recordingsFs) return;
      void recordingsFs.read(storedRecordingName(r.id, r.ext)).then((file) => {
        if (!file) {
          showToast(tr("error.recordMissing"));
          return;
        }
        playRecording(file, r);
      });
    });

    const actions = document.createElement("div");
    actions.className = "recording-actions";
    const subtitles = document.createElement("button");
    subtitles.type = "button";
    subtitles.className = "recording-act";
    subtitles.dataset.recordingSubtitles = "";
    const preference = parseSubtitlePreference(localStorage.getItem(subtitlePreferenceKey(r.id)));
    subtitles.title = preference ? tr("player.subtitlesLastFile", { name: preference.name }) : tr("player.subtitlesFile");
    subtitles.setAttribute("aria-label", tr("player.subtitlesFile"));
    subtitles.textContent = "CC";
    subtitles.addEventListener("click", () => chooseExternalSubtitles(r));
    const download = document.createElement("button");
    download.type = "button";
    download.className = "recording-act";
    download.title = tr("record.download");
    download.setAttribute("aria-label", tr("record.downloadLabel"));
    download.innerHTML = iconMarkup("download");
    download.addEventListener("click", () => {
      if (!recordingsFs) return;
      void recordingsFs.read(storedRecordingName(r.id, r.ext)).then((file) => {
        if (file) offerDownload(file, recordingFileName(r.channelName, new Date(r.startedAt), r.ext));
      });
    });
    actions.append(download);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "recording-act";
    del.title = tr("record.delete");
    del.setAttribute("aria-label", tr("record.delete"));
    del.innerHTML = iconMarkup("trash");
    del.addEventListener("click", () => {
      if (!recordingsFs) return;
      void recordingsFs.remove(storedRecordingName(r.id, r.ext)).then(() => {
        removeRecording(typeof localStorage !== "undefined" ? localStorage : null, r.id);
        recordingSubtitles.delete(r.id);
        localStorage.removeItem(subtitlePreferenceKey(r.id));
        if (currentRecordingId === r.id) {
          ++subtitleRequest;
          currentRecordingId = null;
          player.loadExternalSubtitles([], "");
          qualityMenuUi.refreshQualityUi();
        }
        renderRecordings();
      });
    });
    actions.append(del, subtitles);
    card.append(actions);

    row.append(card);
  }
}

/** Проиграть сохранённый файл в плеере (#159). */
function playRecording(file: File, r: RecordingMeta): void {
  healthAttempt = null;
  closeMultiView(false);
  stopIfRecording();
  lastPlayed = null; // позиция записи не должна сохраняться под URL прошлого канала
  archivePlayback = null;
  const refused = player.playRecording(file, r.ext, r.durationSec);
  currentRecordingId = r.id;
  refreshPlaybackControls();
  if (refused) {
    showToast(refused);
    return;
  }
  playerBar.hidden = false;
  const subtitles = recordingSubtitles.get(r.id);
  if (subtitles) {
    const preference = parseSubtitlePreference(localStorage.getItem(subtitlePreferenceKey(r.id)));
    player.loadExternalSubtitles(subtitles.cues, subtitles.name, preference?.enabled ?? true);
  }
  qualityMenuUi.refreshQualityUi();
  setWatching(true);
  // Заголовок сейчас про запись, а не про канал: сбрасываем канал,
  // категорию и звезду, потом пишем своё (#253).
  refreshNowHeader(null);
  setSystemText(nowTitle, tr("record.title", { channel: r.channelName }));
  nowTitle.title = r.programmeTitle ?? "";
  setSystemText(playerStatus, tr("record.playback"));
  btnRetry.hidden = true;
  liveBadge.hidden = true;
  refreshScrub();
  showToast(tr("record.from", { date: new Date(r.startedAt).toLocaleString(currentLanguage) }));
}

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
  void saveToLibrary(blob, "webm", mimeType);
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
  showToastAction(tr("record.autoDownload"), tr("record.downloadName", { name }), download, 15_000);
}

/**
 * Режим просмотра: канал играет. На широком экране по нему раскладка
 * перестраивается в «список слева, плеер справа».
 */
function setWatching(on: boolean): void {
  appEl.classList.toggle("watch", on);
  syncStatusBarAppearance();
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
    qualityBtn.setAttribute("aria-expanded", String(on));
  } else if (name === "sleep") {
    sleepMenu.hidden = !on;
    btnSleep.setAttribute("aria-expanded", String(on));
    if (on) positionSleepMenu();
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

qualityBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  if (qualityBtn.disabled) return;
  if (qualityMenu.hidden) openOverlay("quality");
  else closeOverlay("quality");
});
$<HTMLButtonElement>("btn-next-episode").addEventListener("click", () => {
  const index = episodeQueue.findIndex((episode) => episode.url === lastPlayed?.url);
  const next = index >= 0 ? episodeQueue[index + 1] : undefined;
  if (next) void playChannel(next);
});
videoEl.addEventListener("ended", () => {
  if (lastPlayed?.mediaKind === "episode") $<HTMLButtonElement>("btn-next-episode").click();
});
subtitleBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  subtitleMenu.hidden = !subtitleMenu.hidden;
  subtitleBtn.setAttribute("aria-expanded", String(!subtitleMenu.hidden));
});
document.addEventListener("click", (event) => {
  if (subtitleWrap.contains(event.target as Node)) return;
  subtitleMenu.hidden = true;
  subtitleBtn.setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || subtitleMenu.hidden) return;
  subtitleMenu.hidden = true;
  subtitleBtn.setAttribute("aria-expanded", "false");
  subtitleBtn.focus();
});
qualityMenu.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest(".menu-item")) closeOverlay("quality");
});
document.addEventListener("click", (event) => {
  const top = topOverlay(overlayStack);
  for (const [name, menu, trigger] of [
    ["quality", qualityMenu, qualityBtn],
    ["sleep", sleepMenu, btnSleep],
  ] as const) {
    if (top === name && !menu.contains(event.target as Node) && !trigger.contains(event.target as Node)) {
      closeOverlay(name);
    }
  }
});

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
 * Скрыть список каналов рядом с плеером: плеер
 * забирает освободившееся место. Выбор запоминается — кто смотрит без
 * списка, тот и в следующий раз хочет без него.
 */
const LIST_COLLAPSED_KEY = "iptv-hub.list-collapsed.v1";

function updateMenuToggle(): void {
  const on = appEl.classList.contains("list-collapsed");
  btnCollapseList.setAttribute("aria-expanded", String(!on));
  btnCollapseList.title = tr(on ? "nav.showMenuShortcut" : "nav.hideMenuShortcut");
  btnCollapseList.setAttribute("aria-label", tr(on ? "nav.showMenu" : "nav.hideMenu"));
  btnCollapseList
    .querySelector("use")
    ?.setAttribute("href", on ? "#i-panel-open" : "#i-panel-close");
}

function setListCollapsed(on: boolean): void {
  const moveFocus = document.activeElement === btnRestorePanel;
  appEl.classList.toggle("list-collapsed", on);
  btnRestorePanel.hidden = !on;
  updateMenuToggle();
  if (!on) renderVirtualWindow();
  if (moveFocus && !on) btnCollapseList.focus();
  try {
    localStorage.setItem(LIST_COLLAPSED_KEY, on ? "1" : "0");
  } catch {
    // приватный режим — живём без памяти
  }
}

btnCollapseList.addEventListener("click", () =>
  setListCollapsed(!appEl.classList.contains("list-collapsed")),
);

// ---------- Полное скрытие панели (сайдбар + список каналов) ----------
// Кнопка «Скрыть панель целиком» на рельсе навигации: уходит и рельс
// навигации, и панель каналов — плеер занимает весь экран. Возврат —
// постоянная кнопка внизу слева, кнопка на кадре или клавиша C.
function setPanelHidden(on: boolean): void {
  const moveFocus = document.activeElement === btnHidePanel || document.activeElement === btnShowMenu;
  if (on && !appEl.classList.contains("list-collapsed")) setListCollapsed(true);
  appEl.classList.toggle("panel-hidden", on);
  if (!on) setListCollapsed(false);
  btnRestorePanel.hidden = !on;
  btnShowMenu.hidden = !on;
  if (moveFocus) (on ? btnShowMenu : btnCollapseList).focus();
  try {
    localStorage.setItem(PANEL_HIDDEN_KEY, on ? "1" : "0");
  } catch {
    // приватный режим
  }
}

const PANEL_HIDDEN_KEY = "iptv-hub.panel-hidden.v1";
btnHidePanel.addEventListener("click", () => setPanelHidden(true));
btnRestorePanel.addEventListener("click", () => setPanelHidden(false));
btnShowMenu.addEventListener("click", () => setPanelHidden(false));
try {
  if (localStorage.getItem(LIST_COLLAPSED_KEY) === "1") setListCollapsed(true);
  if (localStorage.getItem(PANEL_HIDDEN_KEY) === "1") setPanelHidden(true);
} catch {
  // storage недоступен — список развёрнут
}

/** Вид кнопки ⏺ — общий для обоих способов записи. */
function renderRecButton(active: boolean): void {
  btnRec.classList.toggle("recording", active);
  btnRec.title = active
    ? tr("record.stopSave")
    : tr("record.start");
}

const recSession = createRecordingSession({
  createSource: createRecordSource,
  createRecorder: createRecorderAdapter,
  onSave: saveRecording,
  onNotify: showToast,
  language: () => currentLanguage,
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
      showToast(tr("record.captureFallback"));
      startRecording();
      return;
    }
    showToast(tr("error.recordBoth"));
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
  language: () => currentLanguage,
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
    noteRecordingStop();
    void saveToLibrary(blob, result.ext, "");
  },
});

// Подписка переживает смену канала: Player вешает обработчик на каждый новый
// hls-инстанс. init-сегмент держится всегда — для fMP4 без него файл нечитаем;
// новый поток сбрасывает init прошлого (#347).
player.setFragmentListener(
  (payload, isInit) => segSession.feed(payload, isInit),
  () => segSession.resetStream(),
);

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
  noteRecordingStop();
  if (segSession.isRecording()) {
    void segSession.stop(true);
    return;
  }
  if (recSession.isRecording()) recSession.stop(true);
}

function startRecording(): void {
  noteRecordingStart();
  // HLS пишем сегментами; перекодирование остаётся для остального
  // (нативное воспроизведение, прямые mp4).
  if (player.getHls()) {
    pinLevelForRecording();
    // Канал, на который стартует запись: если пока создавалось хранилище
    // (start асинхронен) плеер закрыли или ушли на другой канал — осиротевший
    // старт отменяется без сохранения, чтобы индикатор записи не загорелся
    // для чужого канала (#342).
    const recordingUrl = lastPlayed?.url ?? null;
    void segSession.start().then(() => {
      const movedOn = playerBar.hidden || lastPlayed?.url !== recordingUrl;
      if (segSession.isRecording() && movedOn) {
        void segSession.stop(false);
        restoreLevelAfterRecording();
        return;
      }
      // старт мог не состояться (не создалось хранилище) — не держим качество
      if (!segSession.isRecording()) {
        restoreLevelAfterRecording();
        return;
      }
      // Метка для восстановления после внезапной выгрузки вкладки (#309).
      markRecordingPending(typeof localStorage !== "undefined" ? localStorage : null, {
        channelName: recordingChannel?.name ?? tr("record.defaultName"),
        channelUrl: recordingChannel?.url ?? "",
        programmeTitle: recordingProgrammeTitle,
        startedAt: recordingStartedAt,
      });
    });
    return;
  }
  if (!canRecord()) {
    showToast(tr("error.recordUnsupported"));
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

// ---------- Скриншот кадра (FR-14) ----------
// drawImage(<video>) → PNG. Через MSE кадр не «запачкан», у нативных
// cross-origin потоков без CORS канвас tainted — браузер бросит при toBlob,
// честно сообщаем об ограничении. Логика имён/ошибок — src/screenshot.ts.
function takeScreenshot(): void {
  if (!lastPlayed) return;
  const frame = multiViewUi.activeVideo ?? videoEl;
  if (!frame.videoWidth) {
    showToast(describeShotFailure("empty"));
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = frame.videoWidth;
  canvas.height = frame.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(frame, 0, 0);
  const fail = (reason: ShotFailure): void => showToast(describeShotFailure(reason));
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        fail("tainted");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = screenshotFileName(lastPlayed!.name, new Date());
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      showToast(tr("player.screenshotSaved"));
    },
    "image/png",
    // toBlob для tainted-канваса кидает SecurityError синхронно в некоторых
    // браузерах, в других даёт null — покрыты оба варианта.
  );
}

try {
  // Обёртка try: SecurityError от toBlob может прилететь синхронно.
  btnShot.addEventListener("click", takeScreenshot);
} catch {
  showToast(describeShotFailure("tainted"));
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
reminderUi = createProgrammeReminders({ root: document, minutes: $<HTMLInputElement>("reminder-minutes"), desktop: $<HTMLInputElement>("reminder-desktop"), status: $("reminder-status") }, {
  storage: localStorage,
  playlistIds: () => plState.items.map((p) => p.id),
  language: () => currentLanguage,
  notify: (reminder, playlistId) => notifBellUi.push(tr("reminder.message", { channel: reminder.channelName, title: reminder.title,
    time: new Date(reminder.start).toLocaleTimeString(currentLanguage, { hour: "2-digit", minute: "2-digit" }) }), { playlistId, channelUrl: reminder.channelUrl }),
  watch: (playlistId, channelUrl) => { void watchReminder({ playlistId, channelUrl }); },
});
timelineGuideUi = createTimelineGuide({ scroll: guideGrid, canvas: $("guide-grid-canvas") }, {
  channels: () => visibleChannels.filter((c) => !parentalPins.has(c.group)),
  programmes: channelProgrammes,
  language: () => currentLanguage,
  empty: () => tr("guide.emptyChannels"),
  channelLabel: () => tr("guide.channels"),
  play: (channel, url, programme) => {
    const current = snapshot && displayChannels().find((c) => c.url === channel.url && !parentalPins.has(c.group));
    return current ? playChannel(current, url, programme) : Promise.resolve(false);
  },
  close: () => closeOverlay("guide"),
});

function setGuideMode(grid: boolean): void {
  if (grid && isCompact()) { showToast(tr("guide.mobile")); return; }
  guideGridOn = grid;
  renderGuide();
}
guideListMode.addEventListener("click", () => setGuideMode(false));
guideGridMode.addEventListener("click", () => setGuideMode(true));
window.addEventListener("resize", () => {
  if (guideGridOn && isCompact()) {
    guideGridOn = false;
    if (!guideOverlay.hidden) { showToast(tr("guide.mobile")); renderGuide(); }
  }
});

function openGuide(): void {
  if (!lastPlayed) return;
  guideDayIdx = 0;
  openOverlay("guide");
  renderGuide();
}

function renderGuide(): void {
  guideTitle.textContent = guideGridOn ? tr("guide.gridTitle") : `${tr("guide.title")}${lastPlayed ? ` · ${lastPlayed.name}` : ""}`;
  guideOverlay.querySelector(".guide")!.classList.toggle("timeline-mode", guideGridOn);
  guideListMode.textContent = tr("guide.list");
  guideGridMode.textContent = tr("guide.grid");
  guideListMode.setAttribute("aria-pressed", String(!guideGridOn));
  guideGridMode.setAttribute("aria-pressed", String(guideGridOn));
  guideList.hidden = guideGridOn;
  guideGrid.hidden = !guideGridOn;
  const wins = dayWindows(new Date(), currentLanguage);
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
  if (guideGridOn) { timelineGuideUi!.render(window); return; }
  const now = new Date();
  let progs = programmesInDay(channelProgrammes(), window);
  // Канал без телепрограммы, но с архивом: показываем часовые слоты «без
  // названия» на неделю назад (#314) — клик открывает catchup.
  if (lastPlayed && progs.length === 0) {
    const cu = { days: lastPlayed.catchupDays, source: lastPlayed.catchupSource };
    if (cu.days > 0 && cu.source) {
      progs = programmesInDay(hourlyFallbackProgrammes(now), window);
    }
  }
  if (progs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = tr("guide.noDay");
    guideList.append(empty);
    return;
  }

  for (const p of progs) {
    guideList.append(programmeRow(p, now, () => (guideOverlay.hidden = true)));
  }
}

/**
 * Строка передачи — одна и для шторки с программой, и для блока под
 * плеером. Эфир включается, прошедшее с архивом — открывается из архива,
 * прошедшее без архива приглушено, будущее просто подписано.
 */
function programmeRow(p: EpgProgramme, now: Date, onPlayed: () => void): HTMLElement {
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
  t.textContent = formatRange(p, currentLanguage);
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
  row.append(t, body);

  if (watchable) {
    row.title = isLive ? tr("guide.watchNow") : tr("guide.archiveTitle");
    row.addEventListener("click", async () => {
      if (isLive) {
        if (await playChannel(c)) onPlayed();
        return;
      }
      const url = buildCatchupUrl(cu, p, now);
      if (!url) {
        showToast(tr("error.noArchive"));
        return;
      }
      if (await playChannel(c, url, p)) onPlayed();
    });
  } else if (state === "past") {
    row.title =
      cu.days > 0
        ? tr("guide.outsideArchive")
        : tr("guide.noArchive");
  }
  const wrapper = document.createElement("div"); wrapper.className = "programme-recordable";
  if (stop <= now.getTime()) {
    // Скачивание доступной из архива передачи (#315, #359). Раньше блок стоял
    // после раннего return для прошедших передач и не рисовался вовсе.
    if (!(watchable && cu.source)) return row;
    wrapper.append(row, programmeDownloadButton(c, p, cu));
    return wrapper;
  }
  const record = document.createElement("button"); record.type = "button"; record.className = "btn btn-sm schedule-programme";
  record.textContent = tr("schedule.title");
  const playlistId = plState.activeId;
  record.addEventListener("click", () => { if (playlistId) scheduleUi?.plan(c, p, playlistId); });
  wrapper.append(row, record);
  const reminder = playlistId && reminderUi?.button(c, p, playlistId);
  if (reminder) wrapper.append(reminder);
  return wrapper;
}

/**
 * Кнопка скачивания передачи из архива. Пока идёт скачивание этой передачи,
 * кнопка показывает прогресс и отменяет его; другие кнопки ждут (#359).
 */
function programmeDownloadButton(c: Channel, p: EpgProgramme, cu: { days: number; source: string | null }): HTMLButtonElement {
  const dl = document.createElement("button");
  dl.type = "button";
  dl.className = "btn btn-sm programme-download";
  dl.dataset.downloadChannel = c.url;
  dl.dataset.downloadStart = p.start;
  dl.addEventListener("click", () => {
    const current = downloadStatus();
    if (current) {
      if (current.channelUrl === c.url && current.start === p.start) cancelProgrammeDownload();
      return;
    }
    const url = buildCatchupUrl(cu, p, new Date());
    if (!url) {
      showToast(tr("error.noArchive"));
      return;
    }
    void downloadProgramme({
      channelName: c.name,
      channelUrl: c.url,
      programme: p,
      url,
      fs: recordingsFs,
      storage: localStorage,
      notify: showToast,
      onSaved: renderRecordings,
      onStatus: refreshDownloadUi,
    });
  });
  refreshDownloadButton(dl);
  return dl;
}

function refreshDownloadButton(dl: HTMLButtonElement): void {
  const current = downloadStatus();
  const mine = current !== null && current.channelUrl === dl.dataset.downloadChannel && current.start === dl.dataset.downloadStart;
  dl.disabled = current !== null && !mine;
  dl.classList.toggle("downloading", mine);
  dl.textContent = mine ? tr("download.progress", { pct: Math.floor(current.progress * 100) }) : tr("download.title");
  dl.title = mine ? tr("download.cancel") : current ? tr("download.busy") : tr("download.title");
  dl.setAttribute("aria-label", dl.title);
}

function cancelProgrammeDownload(): void {
  cancelDownload();
  showToast(tr("download.cancelled"));
}

/** Прогресс скачивания: кнопки в программе и строка в разделе «Записи». */
function refreshDownloadUi(): void {
  document.querySelectorAll<HTMLButtonElement>(".programme-download").forEach(refreshDownloadButton);
  const box = $("download-status");
  const current = downloadStatus();
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
  cancel.addEventListener("click", cancelProgrammeDownload);
  box.append(label, bar, cancel);
}

/** Передачи текущего канала по телепрограмме, по времени начала. */
function channelProgrammes(channel: Channel | null = lastPlayed): EpgProgramme[] {
  if (!epg || !channel) return [];
  return (
    epg.get(`id:${channel.tvgId?.toLowerCase() ?? ""}`) ??
    epg.get(`name:${channel.normalizedName}`) ??
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
  const nowMs = archivePlayback?.programme ? Date.parse(archivePlayback.programme.start) : Date.now();
  const i = all.findIndex((p) => Date.parse(p.start) <= nowMs && nowMs < Date.parse(p.stop));
  scheduleKey = lastPlayed && i >= 0 ? `${lastPlayed.url}|${all[i]!.start}` : "";
  schedList.textContent = "";
  nowSchedule.hidden = i < 0;
  if (i < 0) return;
  const now = new Date();
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
  return player.liveEdge;
}

// ---------- Sleep-таймер (FR-13) ----------
// «Выключить через 30/60/90 мин / в конце передачи». Логика — чистый
// модуль sleep-timer.ts, здесь DOM: меню, бейдж, пауза и затемнение.
let sleepState: SleepState = initialSleepState;

function refreshPlaybackControls(): void {
  refreshPlayerVolume();
  const recording = player.isRecordingPlayback;
  const vod = !!lastPlayed?.mediaKind;
  const nextEpisode = $<HTMLButtonElement>("btn-next-episode");
  const index = episodeQueue.findIndex((episode) => episode.url === lastPlayed?.url);
  nextEpisode.hidden = lastPlayed?.mediaKind !== "episode" || index < 0 || index + 1 >= episodeQueue.length;
  btnPrev.hidden = recording;
  btnNext.hidden = recording;
  btnPrev.disabled = recording;
  btnNext.disabled = recording;
  btnRec.hidden = recording;
  btnSleep.hidden = recording;
  btnLive.disabled = recording || vod;
  btnLive.setAttribute("aria-disabled", String(recording || vod));
  btnLive.hidden = recording || vod || (!archivePlayback && !isBehindLive(videoEl.currentTime, liveEdge()));
  btnProgrammeStart.hidden = currentProgrammeStart() === null;
  if (recording) {
    if (overlayStack.includes("quality")) closeOverlay("quality");
    if (overlayStack.includes("sleep")) closeOverlay("sleep");
    sleepState = sleepCancel(sleepState);
    videoStage.classList.remove("sleep-dim");
  }
  const label = sleepLabel(sleepState, Date.now());
  sleepBadge.hidden = recording || label === null;
  if (label !== null) sleepBadge.textContent = label;
  qualityMenuUi.refreshQualityAvailability();
}

videoEl.addEventListener("emptied", refreshScrub);

function sleepRender(): void {
  refreshPlaybackControls();
  for (const b of sleepMenu.querySelectorAll<HTMLButtonElement>("[data-sleep]")) {
    const v = b.dataset.sleep;
    const on =
      (v === "off" && sleepState.mode.kind === "off") ||
      (v === "episode" && sleepState.mode.kind === "episode") ||
      (v !== "off" && v !== "episode" && sleepState.mode.kind === "duration" &&
        sleepRemainderMin(sleepState, Date.now()) !== null &&
        Math.abs((sleepState.mode.kind === "duration" ? sleepState.mode.endsAt : 0) -
          (Date.now() + Number(v) * 60_000)) < 60_000);
    b.className = menuItemClass(on);
    b.setAttribute("aria-selected", String(on));
  }
}

/** Попап привязан к кнопке; CSS ограничивает его краями кадра и высотой. */
function positionSleepMenu(): void {
  if (sleepMenu.hidden || (isCompact() && !playerBar.classList.contains("open"))) return;
  const stage = videoStage.getBoundingClientRect();
  const trigger = btnSleep.getBoundingClientRect();
  sleepMenu.style.setProperty("--sleep-left", `${trigger.right - stage.left - sleepMenu.offsetWidth}px`);
}

new ResizeObserver(positionSleepMenu).observe(videoStage);

function sleepApplyFired(): void {
  if (!sleepState.fired) return;
  if (multiViewUi.isOpen) {
    closeMultiView(false);
    playerBar.hidden = true;
    setWatching(false);
  }
  if (!videoEl.paused) videoEl.pause();
  videoStage.classList.add("sleep-dim");
  showToast(tr("player.sleepStopped"));
}

btnSleep.addEventListener("click", (e) => {
  e.stopPropagation();
  if (player.isRecordingPlayback) return;
  if (sleepMenu.hidden) openOverlay("sleep");
  else closeOverlay("sleep");
  sleepRender();
});

sleepMenu.addEventListener("click", (e) => {
  if (player.isRecordingPlayback) return;
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-sleep]");
  if (!b) return;
  const v = b.dataset.sleep;
  if (v === "off") {
    sleepState = sleepCancel(sleepState);
  } else if (v === "episode") {
    const progs = channelProgrammes();
    const nowMs = Date.now();
    const cur = progs.find(
      (p) => Date.parse(p.start) <= nowMs && nowMs < Date.parse(p.stop),
    );
    if (!cur) {
      showToast(tr("error.noEpg"));
      return;
    }
    sleepState = sleepStartEpisode(sleepState, Date.parse(cur.stop), nowMs);
  } else {
    sleepState = sleepStart(sleepState, Number(v), Date.now());
  }
  closeOverlay("sleep");
  sleepRender();
});

// Тик раз в 10 секунд достаточно: точность ±10с для таймера на полчаса.
window.setInterval(() => {
  const before = sleepState.fired;
  sleepState = sleepTick(sleepState, Date.now());
  if (sleepState.fired && !before) sleepApplyFired();
  sleepRender();
  if (sleepState.mode.kind === "off" && !sleepBadge.hidden) sleepBadge.hidden = true;
}, 10_000);

// Любое действие пользователя снимает затемнение (таймер при этом не сбрасывается:
// он уже сработал — просто возвращаем картинку).
for (const ev of ["click", "keydown"] as const) {
  videoStage.addEventListener(ev, () => {
    if (videoStage.classList.contains("sleep-dim")) {
      videoStage.classList.remove("sleep-dim");
    }
  });
}

function recordingScrubDuration(): number {
  return player.isRecordingPlayback && videoEl.readyState > 0 && Number.isFinite(videoEl.duration) && videoEl.duration > 0
    ? videoEl.duration : 0;
}

function scrubPointerTime(e: PointerEvent): number | null {
  const rect = scrub.getBoundingClientRect();
  return scrubSeekTarget(e.clientX, rect.left, rect.width, recordingScrubDuration());
}

scrub.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !e.isPrimary || scrubDrag) return;
  const time = scrubPointerTime(e);
  if (time === null) return;
  e.preventDefault();
  e.stopPropagation();
  scrubDrag = { pointerId: e.pointerId, time };
  scrub.setPointerCapture(e.pointerId);
  scrub.focus();
  wakeControls();
  refreshScrub();
});
scrub.addEventListener("pointermove", (e) => {
  if (scrubDrag?.pointerId !== e.pointerId) return;
  e.stopPropagation();
  const time = scrubPointerTime(e);
  if (time !== null) scrubDrag.time = time;
  wakeControls();
  refreshScrub();
});
scrub.addEventListener("pointerup", (e) => {
  if (scrubDrag?.pointerId !== e.pointerId) return;
  e.stopPropagation();
  const time = scrubPointerTime(e);
  scrubDrag = null;
  scrub.releasePointerCapture(e.pointerId);
  if (time !== null) videoEl.currentTime = time;
  refreshScrub();
});
for (const event of ["pointercancel", "lostpointercapture"] as const) {
  scrub.addEventListener(event, (e) => {
    if (scrubDrag?.pointerId !== e.pointerId) return;
    scrubDrag = null;
    refreshScrub();
  });
}
scrub.addEventListener("keydown", (e) => {
  const duration = recordingScrubDuration();
  if (!duration || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Home") videoEl.currentTime = 0;
  else if (e.key === "End") videoEl.currentTime = duration;
  else player.seekBy(e.key === "ArrowLeft" ? -15 : 15);
  refreshScrub();
});

/**
 * Полоса: позиция локальной записи или ход передачи по телепрограмме.
 *
 * У прямого эфира нет длительности, поэтому положение в потоке показывать
 * нечем — зато есть программа, и зрителю важно именно «сколько осталось
 * до конца передачи».
 */
function refreshScrub(): void {
  // Отставание от эфира считается ВСЕГДА: оно свойство буфера, а не
  // телепрограммы. Без этого кнопка молчала бы на каналах без EPG —
  // а отстать от эфира на них можно ровно так же.
  refreshPlaybackControls();
  const duration = recordingScrubDuration();
  if (duration) {
    scrub.setAttribute("role", "slider");
    scrub.tabIndex = 0;
    scrub.setAttribute("aria-label", tr("record.position"));
    scrub.setAttribute("aria-valuemin", "0");
    scrub.setAttribute("aria-valuemax", String(duration));
  } else {
    const pointerId = scrubDrag?.pointerId;
    scrubDrag = null;
    if (pointerId !== undefined && scrub.hasPointerCapture(pointerId)) scrub.releasePointerCapture(pointerId);
    for (const attr of ["role", "tabindex", "aria-label", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"]) scrub.removeAttribute(attr);
  }

  if (player.isRecordingPlayback) {
    const position = scrubDrag?.time ?? videoEl.currentTime;
    const timeline = mediaScrub(position, videoEl.duration, player.recordingDurationSec);
    if (duration) {
      scrub.setAttribute("aria-valuenow", String(Math.max(0, Math.min(position, duration))));
      scrub.setAttribute("aria-valuetext", `${timeline.position} / ${timeline.duration}`);
    }
    const pct = `${(timeline.progress * 100).toFixed(1)}%`;
    scrubFill.style.width = pct;
    miniProgFill.style.width = pct;
    progStart.textContent = timeline.position;
    progEnd.textContent = timeline.duration;
    nowShow.textContent = "";
    nowTimeLeft.textContent = "";
    if (scheduleKey) renderSchedule();
    return;
  }

  const prog =
    archivePlayback?.programme ?? (epg && lastPlayed && snapshot ? getNowNext(epg, lastPlayed, snapshot).now : null);
  if (!prog) {
    if (scheduleKey) renderSchedule();
    scrubFill.style.width = "0%";
    miniProgFill.style.width = "0%";
    progStart.textContent = "";
    progEnd.textContent = "";
    nowShow.textContent = "";
    nowTimeLeft.textContent = "";
    return;
  }
  const startMs = Date.parse(prog.start);
  const stopMs = Date.parse(prog.stop);
  const positionMs = archivePlayback ? startMs + videoEl.currentTime * 1000 : Date.now();
  const pct = `${(programmeProgress(positionMs, startMs, stopMs) * 100).toFixed(1)}%`;
  scrubFill.style.width = pct;
  miniProgFill.style.width = pct; // та же цифра: свёрнутый плеер не врёт
  progStart.textContent = clock(startMs, currentLanguage);
  progEnd.textContent = clock(stopMs, currentLanguage);

  // Сменилась передача или канал — перестроить программу под плеером
  if (`${lastPlayed!.url}|${prog.start}` !== scheduleKey) renderSchedule();

  // Название передачи — сверху кадра, «ещё N мин» — у конца полосы
  nowShow.textContent = prog.title;
  nowTimeLeft.textContent = timeLeft(stopMs - positionMs);
}

/** «ещё 58 мин», «ещё 1 ч 5 мин» — до конца передачи. */
function timeLeft(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return tr("player.remainingMinutes", { minutes: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? tr("player.remainingHours", { hours: h }) : tr("player.remainingBoth", { hours: h, minutes: m });
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
    ? channelsForView("recents", displayChannels(), favorites, recents).slice(0, 4)
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
      live.textContent = tr("guide.live");
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
      nowLine.textContent = `${formatRange(prog, currentLanguage)} · ${prog.title}`;
      card.append(nowLine);
    }

    card.addEventListener("click", () => playChannel(c));
    continueRow.append(card);
  }
}

function currentProgrammeStart() {
  if (!lastPlayed || !snapshot || !epg || archivePlayback || multiViewUi.isOpen || player.isRecordingPlayback || playerBar.hidden) return null;
  const programme = getNowNext(epg, lastPlayed, snapshot).now;
  const url = programmeStartUrl({ days: lastPlayed.catchupDays, source: lastPlayed.catchupSource }, programme);
  return programme && url ? { channel: lastPlayed, programme, url } : null;
}

btnProgrammeStart.addEventListener("click", async () => {
  const target = currentProgrammeStart();
  if (target && await playChannel(target.channel, target.url, target.programme, true)) refreshScrub();
});

btnLive.addEventListener("click", async () => {
  if (btnLive.disabled) return;
  if (archivePlayback && lastPlayed) {
    if (await playChannel(lastPlayed)) refreshScrub();
    return;
  }
  player.goLive();
  btnLive.hidden = true;
});

videoEl.addEventListener("timeupdate", refreshScrub);
// Передача идёт и без событий видео: без таймера полоса замирала бы на паузе
// и между timeupdate, которые HLS шлёт нерегулярно.
window.setInterval(() => {
  refreshScrub();
  if (!guideOverlay.hidden && guideGridOn) timelineGuideUi?.refresh();
}, 10_000);

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
    player.seekBy(side === "left" ? -15 : 15);
    showToast(side === "left" ? tr("player.seekBack") : tr("player.seekForward"));
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
    if (menuOpen || scrubDrag || document.activeElement === scrub) {
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
videoEl.addEventListener("loadedmetadata", () => qualityMenuUi.refreshQualityUi());
videoEl.addEventListener("play", wakeControls);
// Меню компактного кадра выходит за его границы: после выбора пункта
// оставляем обычные 3 секунды, чтобы вернуться к кнопке качества (#226).
videoStage.addEventListener("pointerleave", wakeControls);

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
  if (!next) cancelNumericZap();
  playerBar.classList.toggle("open", next);
  syncStatusBarAppearance();
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
      showToast(tr("error.fullscreen"));
    });
  }
});
function renderFullscreenTitle(): void {
  // Иконка одна на оба состояния — меняется только подсказка.
  btnFullscreen.title = document.fullscreenElement
    ? tr("player.exitFullscreen")
    : tr("player.fullscreen");
}
document.addEventListener("fullscreenchange", renderFullscreenTitle);

// ---------- Поиск ----------
// Поиск перерисовывает список после паузы в наборе (#357): каждая буква
// иначе прогоняла весь EPG и пересобирала окно карточек.
const SEARCH_DEBOUNCE_MS = 200;
const searchRender = createDebounced(() => renderChannels(), SEARCH_DEBOUNCE_MS, {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
});
searchInput.addEventListener("input", () => searchRender.schedule());

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
  const refreshLoad = epgGuard.begin();
  try {
    const fresh = await loadPlaylist(item.playlistUrl);
    if (!refreshLoad.isCurrent() || plState.activeId !== item.id) return;
    const diff = diffSnapshots(snapshot, fresh);
    const httpNew = Math.max(0, fresh.droppedHttp - snapshot.droppedHttp);
    const interesting =
      diff.added > 0 || diff.removed > 0 || diff.changed > 0 || httpNew > 0;

    // Программа меняется постоянно — обновляем её при каждой проверке,
    // а не только когда изменился сам плейлист (#104). Гард (#112): если
    // во время проверки переключили плейлист, её EPG не применяется.
    const epgUrls = epgSourceUrls(item.epgUrl, item.additionalEpgUrls ?? [], fresh.headerTvgUrl);
    let programmes: number | null = null;
    if (epgUrls.length) {
      const epgLoad = refreshLoad;
      try {
        const parsed = await loadEpgSources(epgUrls, (completed, total) => {
          if (!epgLoad.isCurrent()) return;
          epgNow.hidden = false;
          setSystemText(epgNow, total === 1 ? tr("loading.epg") : tr("loading.epgSources", { completed, total }));
        });
        if (epgLoad.isCurrent()) {
          epg = parsed;
          programmes = countProgrammes(epg);
          epgNow.hidden = true;
        }
      } catch {
        // программа не критична: списки всё равно обновим, уведомим «передач нет»
        if (epgLoad.isCurrent()) {
          epgNow.hidden = false;
          setSystemText(epgNow, t("error.epg"));
        }
      }
    }

    // Автоподстановка EPG в свойства плейлиста: явно заданный не трогаем (#104)
    if (!item.epgUrl && !item.additionalEpgUrls?.length && fresh.headerTvgUrl) {
      plState = updatePlaylist(plState, item.id, { epgUrl: fresh.headerTvgUrl });
      savePlaylists(localStorage, plState);
      renderPlaylistManager();
    }

    if (interesting || !silentOnNoChange) {
      if (interesting) {
        snapshot = fresh;
        renderGroupSettings();
        renderCategories();
        renderChannels();
        renderPlaylistSwitcher();
        refreshNowFav();
      }
      pushNotification(
        checkSummary(diff, fresh.channels.length, programmes ?? 0, programmes !== null, currentLanguage),
      );
    }
  } catch {
    if (!silentOnNoChange) {
      showToast(tr("error.refresh"));
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
  favoritesOrder = applyFavoritesOrder(snapshot?.channels ?? [], favorites, favoritesOrder).map((channel) => channel.url);
  try {
    localStorage.setItem(favoritesKey(id), JSON.stringify([...favorites]));
    localStorage.setItem(favoritesOrderKey(id), JSON.stringify(favoritesOrder));
  } catch {
    // приватный режим / quota
  }
}

function loadFavoritesOrderFor(id: string): string[] {
  try { return parseFavoritesOrder(localStorage.getItem(favoritesOrderKey(id))).filter((url) => favorites.has(url)); }
  catch { return []; }
}

function reorderFavorite(url: string, target: string): void {
  if (activeView !== "favorites" || !plState.activeId || !snapshot || !favorites.has(url) || !favorites.has(target)) return;
  const order = applyFavoritesOrder(snapshot.channels, favorites, favoritesOrder).map((channel) => channel.url);
  favoritesOrder = moveFavorite(order, url, target);
  try { localStorage.setItem(favoritesOrderKey(plState.activeId), JSON.stringify(favoritesOrder)); } catch { /* текущая сессия */ }
  renderChannels(false);
  const index = visibleResults.findIndex((row) => !("programme" in row) && row.url === url);
  if (index >= 0) focusChannelAt(index);
}

/** Активировать плейлист по id: перезагрузить его избранное и список. */
function activatePlaylist(id: string): void {
  cancelNumericZap();
  plState = { ...plState, activeId: id };
  savePlaylists(localStorage, plState);
  renderSettingsMode();
  favorites = loadFavoritesFor(id);
  loadRecentsFor(id);
  const pl = activePlaylist(plState);
  if (pl) {
    void openPlaylist(pl.playlistUrl, pl.epgUrl);
  }
}

// ---------- Кросс-таб синхронизация (FR-15) ----------
// storage-событие приходит ТОЛЬКО в табы, которые не писали ключ сами —
// эха нет. Политика last-write-wins: состояние просто перечитывается.
window.addEventListener("storage", (e) => {
  if (plState.activeId && (e.key === null || e.key === groupPreferencesKey(plState.activeId))) {
    const previousHidden = groupPreferences.hidden;
    groupPreferences = parseGroupPreferences(localStorage.getItem(groupPreferencesKey(plState.activeId)));
    refreshGroupPreferences(previousHidden);
  }
  if (plState.activeId && (e.key === null || e.key === parentalPinsKey(plState.activeId))) {
    parentalPins = parseParentalPins(localStorage.getItem(parentalPinsKey(plState.activeId)));
    // Изменение защиты в другой вкладке отменяет ранее разрешённый просмотр.
    btnClosePlayer.click();
    activeCategory = null;
    renderPinSettings();
    renderCategories();
    renderChannels();
  }
  const d = classifyStorageChange(e.key);
  if (d.ignore) return;
  if (d.playlists) {
    const prevActive = plState.activeId;
    plState = loadPlaylists(localStorage);
    renderPlaylistManager();
    renderPlaylistSwitcher();
    if (plState.activeId !== prevActive) {
      const pl = activePlaylist(plState);
      if (pl) activatePlaylist(pl.id);
      else showSetup();
    }
  }
  if (d.favorites) {
    const activeId = plState.activeId;
    if (activeId && (e.key === null || e.key === favoritesKey(activeId) || e.key === favoritesOrderKey(activeId))) {
      favorites = loadFavoritesFor(activeId);
      favoritesOrder = loadFavoritesOrderFor(activeId);
      refreshNowFav();
      if (showsChannelList(activeView)) renderChannels(false);
    }
  }
  if (d.theme) {
    currentTheme = themeChoice(localStorage) === "system"
      ? resolveTheme(null, systemPrefersDark())
      : (themeChoice(localStorage) as Theme);
    applyTheme(currentTheme);
    setIcon(btnTheme, themeButtonLabel(currentTheme));
    renderThemeSeg();
  }
});

/** Пересобрать список плейлистов (setup-экран), синхронизировав состояние. */
function renderPlaylistManager(): void {
  playlistUi.renderManager(plState);
}

// ---------- Экспорт / импорт настроек ----------
btnExport.addEventListener("click", async () => {
  btnExport.disabled = true;
  btnExport.setAttribute("aria-busy", "true");
  try {
    saveCurrentPosition();
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
      theme: themeChoice(localStorage),
      playlists: plState.items,
      activeId: plState.activeId,
      favorites: favs,
      recents: recentsBackup,
      ...readBackupSections(localStorage, plState.items.map((p) => p.id)),
      language: currentLanguage,
    });
    const local = await readLocalPlaylistFiles(backup.playlists, playlistOpfsFs);
    backup.localPlaylists = local.files;
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
    showToast(tr("backup.exported"));
    if (local.missing.length) {
      const message = tr("backup.localMissing", { count: local.missing.length });
      showToast(message);
      pushNotification(message);
    }
  } catch {
    showToast(tr("backup.writeFailed"));
  } finally {
    btnExport.disabled = false;
    btnExport.removeAttribute("aria-busy");
  }
});

// Экспорт избранного в .m3u (FR-11): совместимый файл для любых плееров
btnExportFav.addEventListener("click", () => {
  if (!snapshot || !plState.activeId) {
    showToast(tr("backup.openFirst"));
    return;
  }
  const favs = loadFavoritesFor(plState.activeId);
  const m3u = buildFavoritesM3U(snapshot.channels, favs);
  if (!m3u.includes("#EXTINF")) {
    showToast(tr("backup.noFavorites"));
    return;
  }
  const blob = new Blob([m3u], { type: "audio/x-mpegurl" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "favorites.m3u";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  showToast(tr("backup.favoritesExported"));
});

btnImport.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
  const file = importFile.files?.[0];
  if (!file) return;
  file
    .text()
    .then(async (text) => {
      const result = parseBackup(text);
      if (!result.ok) {
        showToast(tr("backup.importFailed", { reason: translateMessage(result.error, currentLanguage) }));
        return;
      }
      const data = result.data;
      stopIfRecording();
      await scheduleUi?.prepareImport();
      closeMultiView(false);
      lastPlayed = null;
      archivePlayback = null;
      player.stop(); // A late pause/pagehide must not overwrite imported positions.
      let error = false;
      try { await restoreLocalPlaylistFiles(data, playlistOpfsFs, () => restoreBackup(localStorage, data)); } catch { error = true; }
      try { sessionStorage.setItem("iptv-hub.backup-result", JSON.stringify({ count: data.playlists.length, warnings: result.warnings, missingLocal: missingLocalFiles(data).length, error })); } catch { /* Storage unavailable. */ }
      const url = new URL(location.href);
      for (const key of ["p", "e", "ch"]) url.searchParams.delete(key);
      history.replaceState(null, "", url);
      location.reload();
    })
    .catch(() => showToast(tr("error.readFile")))
    .finally(() => {
      importFile.value = ""; // повторный выбор того же файла тоже сработает
    });
});

// ---------- Переключатель плейлистов (топбар) — DOM в playlist-ui.ts ----------
function renderPlaylistSwitcher(): void {
  playlistUi.renderSwitcher(plState);
}

playlistUiNodes.plSwitchBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  playlistUi.toggleSwitcherMenu();
});
document.addEventListener("click", (e) => {
  playlistUi.closeSwitcherIfOutside(e.target as Node | null);
});

// ---------- Setup ----------
addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  let pUrl = setupPlaylist.value.trim();
  let eUrl = setupEpg.value.trim();
  const additionalEpgUrls = epgSourcesInput(setupAdditionalEpg.value);
  if (!additionalEpgUrls) { showSetup(tr("error.epgSources")); return; }
  const name = setupName.value.trim();
  if (xtreamMode) {
    const source = validateXtream({ host: xtreamHost.value, username: xtreamUser.value, password: xtreamPassword.value });
    if (!source || (eUrl && !eUrl.startsWith("https://"))) { showSetup(tr("error.xtreamInput")); return; }
    pUrl = xtreamApiUrl(source, "get_live_streams");
    eUrl = eUrl || xtreamEpgUrl(source);
  }
  if (!/^https?:\/\//.test(pUrl)) {
    showSetup(tr("error.playlistUrl"));
    return;
  }
  // http-плейлисты разрешены: если страница https, браузер может заблокировать
  // такой запрос (mixed content) — предупредим заранее, но не блокируем.
  if (isMixedContent(window.location.href, pUrl)) {
    showToast(
      "Плейлист по http://: страница открыта по https://, браузер может заблокировать запрос. Если загрузка упадёт — используйте https-ссылку.",
    );
  }
  plState = addPlaylist(plState, name || tr("playlist.default"), pUrl, eUrl || null);
  if (additionalEpgUrls.length) plState = updatePlaylist(plState, plState.items[plState.items.length - 1]!.id, { additionalEpgUrls });
  if (xtreamMode && xtreamVod.checked) plState = updatePlaylist(plState, plState.items[plState.items.length - 1]!.id, { xtreamVod: true });
  savePlaylists(localStorage, plState);
  setupPlaylist.value = "";
  setupEpg.value = "";
  setupAdditionalEpg.value = "";
  setupName.value = "";
  xtreamHost.value = xtreamUser.value = xtreamPassword.value = "";
  xtreamVod.checked = false;
  renderPlaylistManager();
  activatePlaylist(plState.items[plState.items.length - 1]!.id);
});

// ---------- Локальный плейлист из файла (FR-10) ----------
// Содержимое .m3u хранится в OPFS; Playlist.playlistUrl = "local:<id>" —
// маркер, который транспорт перехватывает и читает из OPFS. Файл
// не покинет устройство. Где OPFS нет — кнопка честно сообщит.
const getLocalFs = playlistOpfsFs;
// Удаление локального плейлиста в playlist-ui.ts чистит и содержимое в OPFS.
playlistUi.setLocalFsProvider(getLocalFs);

const btnLocalFile = $<HTMLButtonElement>("btn-local-file");
const localFile = $<HTMLInputElement>("local-file");

btnLocalFile.addEventListener("click", () => {
  if (!getLocalFs()) {
    showSetup(tr("error.opfs"));
    return;
  }
  localFile.click();
});

localFile.addEventListener("change", async () => {
  const file = localFile.files?.[0];
  localFile.value = "";
  const fs = getLocalFs();
  if (!file || !fs) return;
  const content = await file.text();
  if (!looksLikeM3U(content)) {
    showSetup(tr("error.m3u"));
    return;
  }
  const pl = addLocalPlaylist(plState, defaultLocalName(file.name));
  plState = pl;
  const id = pl.items[pl.items.length - 1]!.id;
  await saveLocalPlaylist(await fs, id, content, null);
  savePlaylists(localStorage, plState);
  renderPlaylistManager();
  activatePlaylist(id);
});

/** Загрузить плейлист через транспорт (OPFS для local:, fetch для http). */
function loadPlaylist(url: string): Promise<PlaylistSnapshot> {
  return playlistTransport.loadPlaylist(url, plState.items.find((playlist) => playlist.playlistUrl === url)?.xtreamVod);
}

/** Подсказка по причине сетевого сбоя (смешанный контент или CORS). */
function describeFetchFailure(url: string, reason?: string): string {
  return playlistTransport.describeFailure(url, reason);
}

/** Открыть плейлист: загрузка + рендер + EPG. Общая для boot/переключения. */
async function openPlaylist(url: string, epgUrl: string | null): Promise<void> {
  seriesEpisodes = null;
  episodeQueue = [];
  ++seriesRequest;
  if (!guideOverlay.hidden) closeOverlay("guide");
  favoritesOrder = plState.activeId ? loadFavoritesOrderFor(plState.activeId) : [];
  healthAttempt = null;
  try { channelHealth = parseChannelHealth(plState.activeId ? localStorage.getItem(channelHealthKey(plState.activeId)) : null); }
  catch { channelHealth = new Map(); }
  cancelNumericZap();
  try { groupPreferences = parseGroupPreferences(plState.activeId ? localStorage.getItem(groupPreferencesKey(plState.activeId)) : null); }
  catch { groupPreferences = parseGroupPreferences(null); }
  playRequest++;
  pinDialog.cancel();
  activeCategory = null;
  try {
    parentalPins = parseParentalPins(plState.activeId ? localStorage.getItem(parentalPinsKey(plState.activeId)) : null);
  } catch { parentalPins = new Map(); }
  channelEditor.close();
  try {
    channelOverrides = parseChannelOverrides(plState.activeId ? localStorage.getItem(channelOverridesKey(plState.activeId)) : null);
  } catch { channelOverrides = new Map(); }
  closeMultiView(false);
  // Смена плейлиста: прошлая раскладка сетки чужая — не тащим её в новый
  // список (#254). multiViewUi к этому моменту инициализирован: openPlaylist
  // вызывается из boot внизу модуля и из действий пользователя.
  multiViewUi.forgetLayout();
  stopIfRecording();
  player.stop();
  playerBar.hidden = true;
  setWatching(false);
  lastPlayed = null;
  snapshot = null;
  archivePlayback = null;
  renderGroupSettings();
  renderPinSettings();
  epg = null;
  showPlayer();
  epgNow.hidden = false;
  setSystemText(epgNow, tr(activePlaylist(plState)?.xtreamVod ? "catalogue.loading" : "loading.playlist"));

  try {
    snapshot = await loadPlaylist(url);
    renderNav();
  } catch (e) {
    showSetup(
      tr("error.loadPlaylist", { reason: translateMessage(e instanceof Error ? e.message : t("error.unknown"), currentLanguage), hint: describeFetchFailure(url) }),
    );
    return;
  }

  // Рендер после загрузки не должен оставлять вечное «Загрузка плейлиста…»
  // (#344): любой бросок здесь показываем как ошибку на экране настроек.
  try {
    renderCategories();
    renderChannels();
    renderPinSettings();
    renderPlaylistSwitcher(); // число каналов рядом с названием плейлиста
    renderGroupSettings();
  } catch (e) {
    console.error("[iptv-hub] ошибка отрисовки плейлиста", e);
    showSetup(tr("error.loadPlaylist", { reason: e instanceof Error ? e.message : t("error.unknown"), hint: "" }));
    return;
  }
  // Скрытые http-каналы — не потеря каналов при загрузке, а фильтр.
  // Извещаем уведомлением с колокольчиком сверху справа, ровно один раз
  // на плейлист (src/http-notice.ts): длинный текст в трёхсекундном тосте
  // не прочесть, а при каждом переключении плейлистов оно стало бы спамом.
  if (snapshot.droppedHttp > 0 && plState.activeId &&
      shouldShowHttpNotice(plState.activeId, localStorage)) {
    pushNotification(
      tr("notifications.http", { count: snapshot.droppedHttp }),
    );
    markHttpNoticeShown(plState.activeId, localStorage);
  }
  // Служебная строка нужна, только пока что-то грузится или не удалось:
  // счётчики «Каналов: N · Категорий: M» уже видны в шапке и у категорий.
  epgNow.hidden = true;

  const finalEpgUrls = epgSourceUrls(epgUrl, activePlaylist(plState)?.additionalEpgUrls ?? [], snapshot.headerTvgUrl);
  if (finalEpgUrls.length) {
    epgNow.hidden = false;
    setSystemText(epgNow, t("loading.epg"));
    // Гард от гонки (#112): пока грузится EPG, можно успеть сменить плейлист —
    // поздний ответ старой загрузки не должен затирать данные нового.
    const epgLoad = epgGuard.begin();
    loadEpgSources(finalEpgUrls, (completed, total) => {
      if (!epgLoad.isCurrent()) return;
      setSystemText(epgNow, total === 1 ? tr("loading.epg") : tr("loading.epgSources", { completed, total }));
    })
      .then((parsed) => {
        if (!epgLoad.isCurrent()) return;
        epg = parsed;
        // EPG догружается позже списка — пролистанная позиция сохраняется (#349).
        renderChannels(false);
        refreshNowFav();
        epgNow.hidden = true;
      })
      .catch(() => {
        if (!epgLoad.isCurrent()) return;
        setSystemText(epgNow, t("error.epg"));
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
  const opening = openPlaylist(active.playlistUrl, active.epgUrl);
  const bootPlayRequest = playRequest;
  await opening;

  // Диплинк на канал (FR-12): ?ch=<url> — после загрузки плейлиста
  // включить канал. Работает и вместе с ?p= (тот же заход).
  const ch = params.get("ch");
  if (ch && snapshot) {
    const hit = resolveChannelDeepLink(snapshot.channels, ch);
    if (hit.found) {
      const target = snapshot.channels.find((c) => c.url === hit.url);
      if (target) playChannel(target);
    } else {
      showToast(tr("error.deepLink"));
    }
  } else if (playerSettings.autoplayLastChannel && !params.has("p") && !params.has("ch") &&
    !lastPlayed && playRequest === bootPlayRequest && plState.activeId === active.id) {
    const target = displayChannels().find((channel) => channel.url === recents[0]);
    if (target) await playChannel(target);
  }
}

// (legacy STORAGE_KEY из config.ts больше не используется — миграция в playlists.ts)

// ---------- PWA: service worker + онлайн-статус ----------
// SW регистрируется только в прод-сборке: в dev он кеширует статику и мешает HMR.
// В Android-приложении ассеты зашиты в APK и открываются с локального origin:
// service worker там только мешает (кеширует то, что и так лежит рядом), а при
// первом запуске без сети ещё и нечего отдавать.
const localOrigin = location.hostname === "appassets.androidplatform.net";
if ("serviceWorker" in navigator && import.meta.env.PROD && !localOrigin) {
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
  showToast(tr("network.offline"));
});
window.addEventListener("online", () => showToast(tr("network.online")));

// Навигация рисуется до загрузки плейлиста: пустой таб-бар в первые секунды
// выглядел бы поломкой.
scheduleUi = createRecordingScheduleUi({
  list: $("recording-schedule"), language: () => currentLanguage, fs: () => recordingsFs,
  protected: (rule) => parseParentalPins(localStorage.getItem(parentalPinsKey(rule.playlistId))).has(rule.group),
  notify: showToast, onSaved: renderRecordings,
});
renderNav();
void bootstrap().catch((e) => {
  // Падение запуска не должно оставлять вечное «Загрузка плейлиста…» (#344).
  console.error("[iptv-hub] ошибка запуска", e);
  showSetup(tr("error.loadPlaylist", { reason: e instanceof Error ? e.message : t("error.unknown"), hint: "" }));
}).then(() => {
  try {
    const raw = sessionStorage.getItem("iptv-hub.backup-result");
    sessionStorage.removeItem("iptv-hub.backup-result");
    if (!raw) return;
    const result = JSON.parse(raw) as { count: number; warnings: string[]; missingLocal?: number; error: boolean };
    showToast(tr(result.error ? "backup.writeFailed" : "backup.imported", { count: result.count }));
    if (!result.error && result.warnings.length) pushNotification(tr("backup.normalized", { sections: result.warnings.join(", ") }));
    if (!result.error && result.missingLocal) {
      const message = tr("backup.localMissing", { count: result.missingLocal });
      showToast(message);
      pushNotification(message);
    }
  } catch { /* No pending import report. */ }
});
