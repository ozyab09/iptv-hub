import "./style.css";
import { createCatalogueCard } from "./catalogue-card";
import { hasLocalProxy, isAppPage, setCompanionPairing, viaDataProxy, viaLocalProxy } from "./app-proxy";
import { connectCompanion, detectPlatform, loadCompanionEnabled, saveCompanionEnabled, takeCompanionParam, type CompanionStatus } from "./companion";
import { createCompanionUi } from "./companion-ui";
import { setPublicHttpAllowed } from "./m3u";
import { createUiFeedback } from "./ui-feedback";
import { isPlaylistFileName, shareTargetSearch } from "./incoming-playlist";
import { createChannelListUi } from "./channel-list-ui";
import { copyText, externalPlayerBridge, isExternalPlayable, openExternally, selectionCopy, streamLink } from "./external-player";
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
import { chipClass, menuItemClass } from "./ui-classes";
import { createRecordingSink } from "./recording-sink";
import { createRecorderAdapter, createRecordingCapture } from "./recording-capture";
import { createGuideUi } from "./guide-ui";
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
  isFavorite,
  toggleFavorite,
} from "./favorites";
import { validateXtream, xtreamApiUrl, xtreamEpgUrl } from "./xtream";
import { createOpfsFs, createTransport, type Transport } from "./playlist-transport";
import { channelEpgKey, formatRange, getNowNext, loadEpgSources } from "./epg";
import { aggregatePlaylists, type AggregateSource } from "./playlist-aggregate";
import { epgSourceUrls, epgSourcesInput } from "./epg-sources";
import { searchProgrammes, programmeArchiveUrl, type ProgrammeMatch } from "./programme-search";
import { createDebounced } from "./debounce";
import { DEFAULT_PLAYER_SETTINGS, PLAYER_SETTINGS_KEY, parsePlayerSettings, sanitizePlayerSettings } from "./player-settings";
import { isBehindLive, programmeProgress } from "./scrub";
import { createScrubUi } from "./scrub-ui";
import { classifySwipe, isDoubleTap, tapSide } from "./gestures";
import {
  loadPosition,
  savePosition,
} from "./positions";
import { loadRecordings, type RecordingMeta } from "./recordings";
import { createRecordingsUi } from "./recordings-ui";
import {
  createRecordingsFs,
  listOpfsNames,
  recordingFileName as storedRecordingName,
  type RecordingsFs,
} from "./recordings-store";
import { markRecordingPending, recoverPendingRecording } from "./recording-recovery";
import { firstFocus, lastFocus, moveFocus } from "./kbd-nav";
import {
  defaultLocalName,
  looksLikeM3U,
  saveLocalPlaylist,
} from "./local-playlist";
import { createScreenshotUi } from "./screenshot-ui";
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
import { applyStorageChange, type StorageReaction } from "./cross-tab";
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
import { createActionGate, createMediaSessionBridge, type MediaSessionBridge, type MediaSessionLike } from "./media-session";
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
  pushRecent,
  recentsKey,
} from "./backup";
import {
  canRecord,
  createRecordingSession,
} from "./recorder";
import { programmeStartUrl } from "./catchup";
import { cancelDownload, downloadProgramme, downloadStatus } from "./programme-downloader";
import { createQualityMenu } from "./quality-menu";
import { createPlaylistUi, type PlaylistUiNodes } from "./playlist-ui";
import { createMultiViewUi } from "./multi-view-ui";
import { createTimelineGuide } from "./timeline-guide-ui";
import { createProgrammeReminders } from "./reminder-ui";
import { createBackupUi } from "./backup-ui";
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
import { APP_SETTINGS_KEY, parseAppSettings, createApkUpdateChecker } from "./apk-updates";
import { createTvUi } from "./tv-ui";

declare const __APP_VERSION__: string;
declare const __APP_VERSION_CODE__: number;
let tvUi: ReturnType<typeof createTvUi> | null = null;
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
// Android-приложение проксирует http публичных хостов (#452): такие каналы
// там не скрываются; в веб-версии — только с подключённым компаньоном (#465).
setPublicHttpAllowed(isAppPage(location.href));
/** EPG-источники через прокси приложения или компаньона, где он нужен. */
const dataProxied = (urls: readonly string[]): string[] => urls.map((url) => viaDataProxy(url, location.href));
/** Мост к MediaSession (#362); создаётся лениво — до объявления плеера его не трогаем. */
let mediaSessionBridge: MediaSessionBridge | null = null;

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
const btnLive = $<HTMLButtonElement>("btn-live");
const btnProgrammeStart = $<HTMLButtonElement>("btn-programme-start");
let archivePlayback: { url: string; programme: EpgProgramme | null; fromStart: boolean } | null = null;
const continueBlock = $("continue-block");
const continueRow = $("continue-row");

const nowTitle = $("now-title");
const nowCategory = $("now-category");
const nowShow = $("now-show");
const btnCollapseList = $<HTMLButtonElement>("btn-collapse-list");
const btnHidePanel = $<HTMLButtonElement>("btn-hide-panel");
const btnRestorePanel = $<HTMLButtonElement>("btn-restore-panel");
const btnShowMenu = $<HTMLButtonElement>("btn-show-menu");
const toastEl = $("toast");
/** Единая обратная связь для main и DOM-модулей (#378); колокольчик подключается лениво. */
const uiFeedback = createUiFeedback({
  toastEl,
  setText: (el, message) => setSystemText(el, message),
  createButton: () => document.createElement("button"),
  createSpan: () => document.createElement("span"),
  push: (message, watch) => notifBellUi.push(message, watch),
});
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
const programmeOverlay = $("programme-overlay");
const guideGrid = $("guide-grid");
let timelineGuideUi: ReturnType<typeof createTimelineGuide> | null = null;
let reminderUi: ReturnType<typeof createProgrammeReminders> | null = null;
const nowSchedule = $("now-schedule");
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
  return healthAttempt && healthAttempt.playlistId === (lastPlayed?.source?.id ?? plState.activeId) && player.currentChannelUrl === healthAttempt.url ? healthAttempt : null;
}

function healthFor(id: string): ChannelHealth {
  return id === plState.activeId ? channelHealth : parseChannelHealth(localStorage.getItem(channelHealthKey(id)));
}

function persistChannelHealth(health = channelHealth, id = plState.activeId): void {
  if (!id) return;
  if (id === plState.activeId) channelHealth = health;
  try {
    if (health.size) localStorage.setItem(channelHealthKey(id), serializeChannelHealth(health));
    else localStorage.removeItem(channelHealthKey(id));
  } catch { /* Метки остаются в текущей сессии. */ }
  renderChannels(false);
}

function noteChannelFailure(): void {
  const attempt = currentHealthAttempt();
  if (!attempt) return;
  const health = markChannelFailure(healthFor(attempt.playlistId), attempt.url, {
    failedAt: Date.now(), kind: isMixedContent(window.location.href, attempt.url) ? "mixed-content" : "unknown",
  });
  persistChannelHealth(health, attempt.playlistId);
}

function noteChannelRecovered(event: Event): void {
  const attempt = currentHealthAttempt();
  const hasVideo = videoEl.videoWidth > 0 || !!player.getHls()?.levels.some((level) => level.videoCodec);
  if (!attempt || !healthFor(attempt.playlistId).has(attempt.url) || !isChannelRecovered(videoEl, event.type, hasVideo)) return;
  persistChannelHealth(clearChannelFailure(healthFor(attempt.playlistId), attempt.url), attempt.playlistId);
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
  if (allPlaylists) return aggregatePlaylists(aggregateSources()).snapshot.channels;
  return filterVisibleGroups(applyChannelOverrides(snapshot?.channels ?? [], channelOverrides), groupPreferences.hidden);
}

function renderGroupSettings(): void {
  groupPreferencesUi.render((allPlaylists && plState.activeId ? playlistCache.get(plState.activeId)?.snapshot : snapshot)?.categories ?? [], groupPreferences);
}

function refreshGroupPreferences(previousHidden: ReadonlySet<string>): void {
  playRequest++;
  pinDialog.cancel();
  if (activeCategory && groupPreferences.hidden.has(activeCategory)) activeCategory = null;
  const newlyHidden = [...groupPreferences.hidden].some((group) => !previousHidden.has(group));
  if ((multiViewUi.isOpen && newlyHidden) || (lastPlayed && (lastPlayed.source?.id ?? plState.activeId) === plState.activeId && groupPreferences.hidden.has(lastPlayed.group))) btnClosePlayer.click();
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
let allPlaylists = false;
let aggregateRequest = 0;
const playlistCache = new Map<string, { snapshot: PlaylistSnapshot; epg: Map<string, EpgProgramme[]> | null }>();
let aggregateFilter: { search: string; category: string | null; view: View; scroll: number } | null = null;

function aggregateSources(): AggregateSource[] {
  return plState.items.flatMap(item => {
    const cached = playlistCache.get(item.id);
    return cached ? [{ ...cached, id: item.id, name: item.name,
      overrides: parseChannelOverrides(localStorage.getItem(channelOverridesKey(item.id))),
      hiddenGroups: parseGroupPreferences(localStorage.getItem(groupPreferencesKey(item.id))).hidden }] : [];
  });
}

function updateAggregate(): void {
  if (!allPlaylists) return;
  const data = aggregatePlaylists(aggregateSources());
  snapshot = data.snapshot; epg = data.epg;
  if (activeCategory && !snapshot.categories.includes(activeCategory)) activeCategory = null;
  const saved = new Map(plState.items.map(item => [item.id, loadFavoritesFor(item.id)]));
  favorites = new Set(data.snapshot.channels.filter(c => saved.get(c.source!.id)?.has(c.url)).map(c => c.url));
  favoritesOrder = plState.items.flatMap(item => parseFavoritesOrder(localStorage.getItem(favoritesOrderKey(item.id))).filter(url => saved.get(item.id)?.has(url)));
}

/** Меняет только контекст хранилищ; текущий поток не перезапускается. */
function playlistContext(id: string): void {
  plState = { ...plState, activeId: id };
  savePlaylists(localStorage, plState);
  groupPreferences = parseGroupPreferences(localStorage.getItem(groupPreferencesKey(id)));
  parentalPins = parseParentalPins(localStorage.getItem(parentalPinsKey(id)));
  channelOverrides = parseChannelOverrides(localStorage.getItem(channelOverridesKey(id)));
  channelHealth = parseChannelHealth(localStorage.getItem(channelHealthKey(id)));
  favorites = loadFavoritesFor(id); favoritesOrder = loadFavoritesOrderFor(id);
  loadRecentsFor(id);
  updateAggregate();
}

async function activateAllPlaylists(refresh = false): Promise<void> {
  const request = ++aggregateRequest;
  epgGuard.begin();
  if (lastPlayed && !lastPlayed.source && plState.activeId) {
    const item = activePlaylist(plState)!;
    lastPlayed = { ...lastPlayed, source: { id: item.id, name: item.name, group: lastPlayed.group } };
  }
  allPlaylists = true;
  seriesEpisodes = null;
  showPlayer();
  epgNow.hidden = false;
  setSystemText(epgNow, tr("loading.playlist"));
  await Promise.all(plState.items.map(async item => {
    const cached = playlistCache.get(item.id);
    if (!refresh && cached?.epg) return;
    try {
      const fresh = !refresh && cached ? cached.snapshot : await loadPlaylist(item.playlistUrl);
      const diff = cached ? diffSnapshots(cached.snapshot, fresh) : null;
      if (request !== aggregateRequest) return;
      playlistCache.set(item.id, { snapshot: fresh, epg: playlistCache.get(item.id)?.epg ?? null });
      updateAggregate(); renderCategories(); renderChannels(false); renderPlaylistSwitcher();
      const urls = epgSourceUrls(item.epgUrl, item.additionalEpgUrls ?? [], fresh.headerTvgUrl);
      if (urls.length) {
        const programmes = await loadEpgSources(dataProxied(urls));
        if (request === aggregateRequest) playlistCache.set(item.id, { snapshot: fresh, epg: programmes });
      }
      if (refresh && request === aggregateRequest && diff && (diff.added || diff.removed || diff.changed)) {
        const programmes = playlistCache.get(item.id)?.epg;
        pushNotification(item.name + " · " + checkSummary(diff, fresh.channels.length, programmes ? countProgrammes(programmes) : 0, !!programmes, currentLanguage));
      }
    } catch { if (request === aggregateRequest) pushNotification(tr("playlist.partial", { name: item.name })); }
  }));
  if (request !== aggregateRequest || !allPlaylists) return;
  epgNow.hidden = true;
  updateAggregate();
  if (aggregateFilter && !refresh) {
    searchInput.value = aggregateFilter.search; activeCategory = aggregateFilter.category;
    setView(aggregateFilter.view);
    channelList.scrollTop = aggregateFilter.scroll;
  }
  renderNav(); renderCategories(); renderChannels(false); renderPlaylistSwitcher(); refreshNowFav();
}

function toggleChannelFavorite(c: Channel): void {
  const id = c.source?.id ?? plState.activeId;
  if (!id) return;
  const next = toggleFavorite(loadFavoritesFor(id), c);
  try { localStorage.setItem(favoritesKey(id), JSON.stringify([...next])); }
  catch { /* приватный режим / quota */ }
  if (id === plState.activeId) { favorites = next; saveFavoritesFor(id); }
  updateAggregate(); refreshNowFav(); renderCategories(); renderChannels(false);
}
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
  allPlaylists: () => allPlaylists,
  activateAll: () => { void activateAllPlaylists(); },
  renderSettingsMode,
  stateChanged: (next) => {
    for (const item of plState.items) {
      const updated = next.items.find(p => p.id === item.id);
      if (!updated || JSON.stringify(updated) !== JSON.stringify(item)) playlistCache.delete(item.id);
    }
    plState = next;
    if (lastPlayed?.source && !next.items.some(item => item.id === lastPlayed!.source!.id)) btnClosePlayer.click();
    if (allPlaylists) void activateAllPlaylists();
  },
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
  move: (group, step) => saveGroupPreferences({ ...groupPreferences, order: moveGroup((allPlaylists && plState.activeId ? playlistCache.get(plState.activeId)?.snapshot : snapshot)?.categories ?? [], groupPreferences.order, group, step) }),
  showAll: () => saveGroupPreferences({ ...groupPreferences, hidden: new Set() }),
  resetOrder: () => saveGroupPreferences({ ...groupPreferences, order: [] }),
});

// ---------- Транспорт загрузки плейлистов — playlist-transport.ts (issue #123) ----------
// Тоже создаётся до первого топ-уровневого кода ниже по модулю (см. комментарий
// про TDZ выше), но его deps инлайн-функции — краш невозможен по построению.
const playlistOpfsFs = createOpfsFs(typeof navigator !== "undefined" ? navigator.storage : null);
const playlistTransport: Transport = createTransport({
  fs: playlistOpfsFs,
  // В Android-приложении http-плейлисты публичных хостов идут через его прокси
  // (#452); с сопряжённым компаньоном — и https-плейлисты/EPG/Xtream без
  // CORS-заголовков провайдера (#465).
  fetch: (url, init) => fetch(viaDataProxy(url, location.href), init),
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
  const failedAt = attempt ? healthFor(attempt.playlistId).get(attempt.url)?.failedAt : undefined;
  try {
    const r = await probeStream(url, (u, init) => fetch(viaLocalProxy(u, location.href), init), player.diagnosticsTimeoutMs);
    if (attempt && currentHealthAttempt() === attempt && failedAt !== undefined && healthFor(attempt.playlistId).get(attempt.url)?.failedAt === failedAt) {
      const kind = isMixedContent(window.location.href, attempt.url) ? "mixed-content" : r.kind === "ok" ? "unknown" : r.kind;
      persistChannelHealth(markChannelFailure(healthFor(attempt.playlistId), attempt.url, { failedAt, kind, ...(r.kind === "http" ? { status: r.status } : {}) }), attempt.playlistId);
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
    setFatalActions(false); // поток ожил — retry не нужен
  },
  () => {
    setFatalActions(true); // фатальная ошибка — показываем retry и ссылку на поток
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
    if (channel?.source) playlistContext(channel.source.id);
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
  resolve: (url) => displayChannels().find((c) => c.url === url && !(c.source
    ? parseParentalPins(localStorage.getItem(parentalPinsKey(c.source.id))).has(c.source.group)
    : parentalPins.has(c.group))) ?? null,
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
  guideUi.renderSchedule();
  if (!guideOverlay.hidden) guideUi.render();
  renderFullscreenTitle();
});

// ---------- UI helpers — тосты и уведомления: src/ui-feedback.ts (#378) ----------
function showToast(msg: string): void {
  uiFeedback.toast(msg);
}

/** Тост с кнопкой действия (для Firefox-скачивания нужен новый user gesture). */
function showToastAction(msg: string, actionLabel: string, action: () => void, durationMs?: number): void {
  uiFeedback.toastAction(msg, actionLabel, action, durationMs);
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
  uiFeedback.notify(message);
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
  pinGroup.replaceChildren(...((allPlaylists && plState.activeId ? playlistCache.get(plState.activeId)?.snapshot : snapshot)?.categories ?? []).map((group) => {
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
  if (multiViewUi.isOpen || (lastPlayed?.group === group && (lastPlayed.source?.id ?? id) === id)) btnClosePlayer.click();
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
  if (allPlaylists) {
    const source = displayChannels().find(c => c.group === value)?.source;
    if (source) {
      const record = parseParentalPins(localStorage.getItem(parentalPinsKey(source.id))).get(source.group);
      if (record && !await pinDialog.ask(source.group, false, pin => verifyPin(pin, record))) return;
    }
    activeCategory = value; catMenu.hidden = true;
    btnCategories.setAttribute("aria-expanded", "false"); renderCategories(); renderChannels(); return;
  }
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
  if (channel.source) playlistContext(channel.source.id);
  editedChannelUrl = channel.url;
  channelExternal.hidden = !externalBridge || !isExternalPlayable(channel.url);
  const original = (channel.source ? playlistCache.get(channel.source.id)?.snapshot : snapshot)?.channels.find((c) => c.url === channel.url);
  $("channel-original").textContent = original?.name ?? channel.name;
  channelAlias.value = channelOverrides.get(channel.url)?.alias ?? "";
  channelEpgId.value = channelOverrides.get(channel.url)?.epgId ?? "";
  channelHidden.checked = channelOverrides.get(channel.url)?.hidden ?? false;
  channelEditor.showModal();
  channelAlias.focus();
}

// ---------- Ссылка на поток и внешний плеер (#372) ----------
// Без бэкенда неиграемый в браузере канал можно только отдать дальше:
// в приложении — системному выбору плеера, в браузере — в буфер обмена.
const externalBridge = externalPlayerBridge(window);
const btnStreamOut = $<HTMLButtonElement>("btn-stream-out");
const channelExternal = $<HTMLButtonElement>("channel-external");

function copyStreamLink(url: string): void {
  void copyText(url, { clipboard: navigator.clipboard ?? null, fallback: selectionCopy(document) })
    .then((ok) => showToast(ok ? tr("stream.copied") : tr("stream.copyFailed")));
}

function sendToExternalPlayer(url: string): void {
  if (openExternally(externalBridge, url)) showToast(tr("stream.externalSent"));
  else copyStreamLink(url);
}

/** Retry и ссылка на текущий источник видны только после фатальной ошибки. */
function setFatalActions(on: boolean): void {
  btnRetry.hidden = !on;
  const url = streamLink(lastPlayed?.url ?? null, archivePlayback?.url ?? null);
  btnStreamOut.hidden = !on || url === null;
  const label = externalBridge ? tr("stream.external") : tr("stream.copy");
  btnStreamOut.title = label;
  btnStreamOut.setAttribute("aria-label", label);
}

btnStreamOut.addEventListener("click", () => {
  const url = streamLink(lastPlayed?.url ?? null, archivePlayback?.url ?? null);
  if (url) sendToExternalPlayer(url);
});
$("channel-copy-stream").addEventListener("click", () => {
  if (editedChannelUrl) copyStreamLink(editedChannelUrl);
});
channelExternal.addEventListener("click", () => {
  if (editedChannelUrl) sendToExternalPlayer(editedChannelUrl);
});

function refreshChannelOverrides(): void {
  if (!snapshot) return;
  const nameFor = (channel: Channel): string => {
    const original = (channel.source ? playlistCache.get(channel.source.id)?.snapshot : snapshot)!.channels.find((c) => c.url === channel.url) ?? channel;
    const overrides = channel.source ? parseChannelOverrides(localStorage.getItem(channelOverridesKey(channel.source.id))) : channelOverrides;
    return applyChannelOverrides([original], overrides, true)[0]!.name;
  };
  if (lastPlayed && (lastPlayed.source?.id ?? plState.activeId) === plState.activeId) {
    lastPlayed.name = nameFor(lastPlayed);
    const original = (lastPlayed.source ? playlistCache.get(lastPlayed.source.id)?.snapshot : snapshot)?.channels.find((channel) => channel.url === lastPlayed!.url) ?? lastPlayed;
    lastPlayed.tvgId = applyChannelOverrides([original], channelOverrides, true)[0]!.tvgId;
    refreshNowHeader(lastPlayed);
  }
  multiViewUi.updateNames(nameFor);
  updateAggregate();
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
    const source = allPlaylists ? channels.find(c => c.group === value)?.source : null;
    if (value !== null && (source ? parseParentalPins(localStorage.getItem(parentalPinsKey(source.id))).has(source.group) : parentalPins.has(value))) b.title = tr("pin.protected");
    b.addEventListener("click", () => { void selectCategory(value); });
    return b;
  };
  const entries: Array<[string, string | null, number]> = [
    [tr("categories.all"), null, channels.length],
    ...orderedGroups([...new Set(channels.map((channel) => channel.group))], allPlaylists ? [] : groupPreferences.order).filter((g) => allPlaylists || !groupPreferences.hidden.has(g)).map(
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

// ---------- Список каналов (виртуализированный) — src/channel-list-ui.ts (#367) ----------
const channelListUi = createChannelListUi({
  list: channelList,
  results: () => visibleResults,
  isCatalogue: () => (activeView === "movies" || activeView === "series") && !seriesEpisodes,
  isFavoritesView: () => activeView === "favorites",
  currentUrl: () => lastPlayed?.url ?? null,
  isFavorite: (c) => isFavorite(favorites, c),
  failure: (url) => {
    const source = allPlaylists ? snapshot?.channels.find(c => c.url === url)?.source : undefined;
    return source ? parseChannelHealth(localStorage.getItem(channelHealthKey(source.id))).get(url) : channelHealth.get(url);
  },
  failureLabel: channelFailureLabel,
  nowNext: (c) => (epg && snapshot ? getNowNext(epg, c, snapshot) : null),
  language: () => currentLanguage,
  toast: showToast,
  play: (c) => void playChannel(c),
  playProgramme: (match) => void (async () => {
    const archive = programmeArchiveUrl(match);
    const played = await playChannel(match.channel, archive ?? undefined, match.programme);
    if (played && !archive && Date.parse(match.programme.start) > Date.now()) showToast(tr("guide.futureLive"));
  })(),
  toggleFavorite: (c) => {
    toggleChannelFavorite(c);
  },
  openEditor: openChannelEditor,
  reorderFavorite,
  playlistId: () => plState.activeId,
  onDragStart: cancelNumericZap,
  reminderButton: (match) => {
    const id = match.channel.source?.id ?? plState.activeId;
    return id ? reminderUi?.button(match.channel, match.programme, id) ?? null : null;
  },
  catalogueCard: (c) => createCatalogueCard(document, c, () => { void playChannel(c); }),
  setIcon,
  canHover: () => window.matchMedia("(hover: hover)").matches,
});

// Поворот экрана / resize меняет ширину контейнера (число колонок) и питч —
// пересчитываем окно, иначе спейсер остаётся со старой высотой и карточки
// наезжают друг на друга (issue #62).
window.addEventListener("resize", () => {
  syncStatusBarAppearance();
  if (playerScreen.hidden) return;
  channelListUi.renderWindow();
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
  renderContinue();
  channelListUi.render(resetScroll);
  if (!guideOverlay.hidden && guideUi.isGrid()) timelineGuideUi?.refresh();
}

// ---------- Плеер ----------
async function playChannel(c: Channel, archiveUrl?: string, archiveProgramme?: EpgProgramme, fromStart = false): Promise<boolean> {
  cancelNumericZap();
  const request = ++playRequest;
  ++seriesRequest;
  if (c.mediaKind !== "episode") episodeQueue = [];
  const previousId = plState.activeId;
  const source = c.source;
  const id = source?.id ?? previousId;
  const original = (source ? playlistCache.get(source.id)?.snapshot : snapshot)?.channels.find(original => original.url === c.url) ?? c;
  const overrides = source ? parseChannelOverrides(localStorage.getItem(channelOverridesKey(source.id))) : channelOverrides;
  c = { ...applyChannelOverrides([original], overrides, true)[0]!, ...(source ? { source } : {}) };
  const groups = source ? parseGroupPreferences(localStorage.getItem(groupPreferencesKey(source.id))) : groupPreferences;
  if (groups.hidden.has(c.group)) { showToast(tr("groups.hidden")); return false; }
  const record = source ? parseParentalPins(localStorage.getItem(parentalPinsKey(source.id))).get(c.group) : parentalPins.get(c.group);
  if (!record) pinDialog.cancel();
  const authorized = record ? await pinDialog.ask(c.group, false, pin => verifyPin(pin, record)) : true;
  if (!authorized || request !== playRequest || plState.activeId !== previousId) return false;
  if (source && id && id !== previousId) playlistContext(id);
  if (c.mediaKind === "series") {
    const request = ++seriesRequest;
    const playlist = activePlaylist(plState);
    if (!playlist?.xtreamVod || groupPreferences.hidden.has(c.group)) return false;
    showToast(tr("catalogue.episodes"));
    try {
      const loaded = await playlistTransport.loadSeries(playlist.playlistUrl, c);
      const episodes = source ? loaded.map(channel => ({ ...channel, source: { ...source, group: channel.group } })) : loaded;
      if (request !== seriesRequest || plState.activeId !== playlist.id) return false;
      seriesEpisodes = episodes;
      episodeQueue = episodes;
      const cached = playlistCache.get(playlist.id);
      if (cached) cached.snapshot = { ...cached.snapshot, channels: [...cached.snapshot.channels.filter(item => item.mediaKind !== "episode" || item.seriesId !== c.seriesId), ...loaded] };
      snapshot = snapshot ? { ...snapshot, channels: [...snapshot.channels.filter((item) => item.mediaKind !== "episode" || item.seriesId !== c.seriesId), ...episodes] } : null;
      searchInput.value = "";
      activeCategory = null;
      setView("series");
      const resume = resumeEpisode(episodes, recents);
      return resume ? playChannel(resume) : false;
    } catch (error) { if (request === seriesRequest) showToast(error instanceof Error ? error.message : tr("error.xtreamResponse")); return false; }
  }
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
  setFatalActions(false); // новый канал — сбрасываем retry-статус
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
  mediaSession().clear();
  renderChannels();
});

btnPause.addEventListener("click", () => {
  player.togglePause();
});
// Wake Lock (FR-7): пока играет и вкладка видима — экран не гаснет.
  videoEl.addEventListener("play", () => {
    wakeLockState = wakeLockPlay(wakeLockState, wakeLockHooks, document.visibilityState === "visible");
    setIcon(btnPause, "pause");
    syncMediaSession();
  });
  videoEl.addEventListener("pause", () => {
    wakeLockState = wakeLockStop(wakeLockState);
    setIcon(btnPause, "play");
    syncMediaSession();
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
/**
 * Одно нажатие медиа-кнопки может прийти и keydown, и обработчиком
 * MediaSession (#362): повтор того же действия за 100 мс отбрасывается —
 * дубли приходят почти одновременно, а быстрые нажатия человека реже.
 */
const allowMediaAction = createActionGate(100, () => Date.now());

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
  setFatalActions(false);
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
  const fav = isFavorite(lastPlayed.source ? loadFavoritesFor(lastPlayed.source.id) : favorites, lastPlayed);
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
  toggleChannelFavorite(lastPlayed);
});

// ---------- Клавиатурная навигация по списку каналов (FR-8) ----------
// ↑/↓ — перемещение, Home/End — края, Enter — включить. Работает, когда
// фокус уже на карточке канала (карточки — кнопки) или на поиске.
// Математика фокуса — чистый модуль kbd-nav.ts.
function focusedChannelIndex(): number {
  return channelListUi.focusedIndex();
}

function focusChannelAt(index: number): void {
  channelListUi.focusAt(index);
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
      if (allowMediaAction(action)) applyMediaKey(action);
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
      screenshotUi.take();
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
      if (guideOverlay.hidden) guideUi.open();
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
// Жизненный цикл живёт в recorder.ts (createRecordingSession), источник кадров
// и адаптер MediaRecorder — в recording-capture.ts (#366).
const recordingCapture = createRecordingCapture({
  video: videoEl,
  captureAudioTrack: () => player.captureAudioTrack(),
  language: () => currentLanguage,
  onNoFrames: () => {
    recSession.stop(false);
    showToast(tr("record.noFrames"));
  },
});

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

function saveToLibrary(blob: Blob, ext: string): Promise<void> {
  return recordingsUi.saveToLibrary(blob, ext, {
    channelName: recordingChannel?.name ?? tr("record.defaultName"),
    channelUrl: recordingChannel?.url ?? "",
    programmeTitle: recordingProgrammeTitle,
    startedAt: recordingStartedAt || Date.now(),
    durationSec: recordedDurationSec,
  });
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

// Список, карточки, сохранение и скачивание записей — src/recordings-ui.ts (#365).
const recordingsUi = createRecordingsUi({
  nodes: { screen: $("recordings-screen"), empty: $("recordings-empty"), list: $("recordings-list") },
  fs: () => recordingsFs,
  storage: () => (typeof localStorage !== "undefined" ? localStorage : null),
  isActive: () => activeView === "recordings",
  language: () => currentLanguage,
  toast: showToast,
  toastAction: showToastAction,
  play: playRecording,
  chooseSubtitles: chooseExternalSubtitles,
  onDeleted: (id) => {
    recordingSubtitles.delete(id);
    if (currentRecordingId !== id) return;
    ++subtitleRequest;
    currentRecordingId = null;
    player.loadExternalSubtitles([], "");
    qualityMenuUi.refreshQualityUi();
  },
  beforeRender: () => {
    scheduleUi?.render();
    guideUi.refreshDownloads();
  },
});

function renderRecordings(): void {
  recordingsUi.render();
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
  setFatalActions(false);
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
  void saveToLibrary(blob, "webm");
}

/**
 * Режим просмотра: канал играет. На широком экране по нему раскладка
 * перестраивается в «список слева, плеер справа».
 */
function setWatching(on: boolean): void {
  appEl.classList.toggle("watch", on);
  syncStatusBarAppearance();
  tvUi?.refresh();
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
  else if (name === "programme") programmeOverlay.hidden = !on;
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
  if (!on) channelListUi.renderWindow();
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
  createSource: () => recordingCapture.createSource(),
  createRecorder: (stream, mimeType) => createRecorderAdapter(stream, mimeType),
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
    const next = recordingCapture.nextStrategy();
    if (next) {
      console.debug(`[iptv-hub] rec: переключаюсь на ${next}`);
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
    void saveToLibrary(blob, result.ext);
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
  recordingCapture.resetNote();
  recSession.start();
  if (recSession.isRecording() && recordingCapture.note()) showToast(recordingCapture.note());
}

// ---------- Скриншот кадра (FR-14) — src/screenshot-ui.ts (#364) ----------
const screenshotUi = createScreenshotUi({
  button: btnShot,
  frame: () => multiViewUi.activeVideo ?? videoEl,
  channelName: () => lastPlayed?.name ?? null,
  toast: showToast,
  savedMessage: () => tr("player.screenshotSaved"),
});

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
reminderUi = createProgrammeReminders({ root: document, minutes: $<HTMLInputElement>("reminder-minutes"), desktop: $<HTMLInputElement>("reminder-desktop"), status: $("reminder-status") }, {
  storage: localStorage,
  playlistIds: () => plState.items.map((p) => p.id),
  language: () => currentLanguage,
  notify: (reminder, playlistId) => uiFeedback.notify(tr("reminder.message", { channel: reminder.channelName, title: reminder.title,
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

// Шторка «Программа», блок под плеером и карточка передачи — src/guide-ui.ts (#368).
const guideUi = createGuideUi({
  nodes: {
    overlay: guideOverlay,
    title: $("guide-title"),
    days: $("guide-days"),
    list: $("guide-list"),
    grid: guideGrid,
    listMode: $<HTMLButtonElement>("guide-mode-list"),
    gridMode: $<HTMLButtonElement>("guide-mode-grid"),
    schedule: nowSchedule,
    scheduleList: $("sched-list"),
    card: {
      overlay: programmeOverlay,
      title: $("programme-card-title"),
      meta: $("programme-card-meta"),
      desc: $("programme-card-desc"),
      actions: $("programme-card-actions"),
      close: $<HTMLButtonElement>("programme-card-close"),
    },
    downloadStatus: $("download-status"),
  },
  channel: () => lastPlayed,
  programmes: (channel) => channelProgrammes(channel),
  archiveProgramme: () => archivePlayback?.programme ?? null,
  language: () => currentLanguage,
  toast: showToast,
  playChannel: (channel, url, programme) => playChannel(channel, url, programme),
  isCompact,
  renderTimeline: (day) => timelineGuideUi!.render(day),
  openOverlay,
  closeOverlay,
  playlistId: () => plState.activeId,
  planRecording: (channel, programme, playlistId) => scheduleUi?.plan(channel, programme, channel.source?.id ?? playlistId),
  reminderButton: (channel, programme, playlistId) => reminderUi?.button(channel, programme, channel.source?.id ?? playlistId) ?? null,
  downloads: {
    status: downloadStatus,
    cancel: cancelDownload,
    start: (channel, programme, url) => void downloadProgramme({
      channelName: channel.name,
      channelUrl: channel.url,
      programme,
      url,
      fs: recordingsFs,
      storage: localStorage,
      notify: showToast,
      onSaved: renderRecordings,
      onStatus: () => guideUi.refreshDownloads(),
    }),
  },
  setIcon,
});
window.addEventListener("resize", () => guideUi.onResize());

/** Передачи канала по телепрограмме, по времени начала. */
function channelProgrammes(channel: Channel | null = lastPlayed): EpgProgramme[] {
  if (!epg || !channel) return [];
  return (
    epg.get(channelEpgKey(channel)) ??
    epg.get(channelEpgKey(channel, true)) ??
    []
  );
}

btnGuide.addEventListener("click", () => guideUi.open());
btnFullGuide.addEventListener("click", () => guideUi.open());
guideClose.addEventListener("click", () => closeOverlay("guide"));

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

// Полоса прогресса и мини-полоска — src/scrub-ui.ts (#369).
const scrubUi = createScrubUi({
  nodes: {
    scrub,
    fill: $("scrub-fill"),
    miniFill: $("mini-prog-fill"),
    start: $("prog-start"),
    end: $("prog-end"),
    show: nowShow,
    timeLeft: $("now-time-left"),
  },
  video: videoEl,
  isRecording: () => player.isRecordingPlayback,
  recordingDurationSec: () => player.recordingDurationSec,
  seekBy: (seconds) => player.seekBy(seconds),
  archiveProgramme: () => archivePlayback?.programme ?? null,
  liveProgramme: () => (epg && lastPlayed && snapshot ? getNowNext(epg, lastPlayed, snapshot).now : null),
  channelUrl: () => lastPlayed?.url ?? null,
  scheduleKey: () => guideUi.scheduleKey(),
  renderSchedule: () => guideUi.renderSchedule(),
  language: () => currentLanguage,
  wake: () => wakeControls(),
  refresh: () => refreshScrub(),
});

/**
 * Полоса: позиция локальной записи или ход передачи по телепрограмме.
 *
 * У прямого эфира нет длительности, поэтому положение в потоке показывать
 * нечем — зато есть программа, и зрителю важно именно «сколько осталось
 * до конца передачи».
 */
function refreshScrub(): void {
  tvUi?.refresh();
  refreshPlaybackControls();
  scrubUi.render();
  syncMediaSession();
}

/**
 * Карточка «что играет» в системе (#362): канал или запись, текущая
 * передача, логотип. Повтор тех же данных мост отбрасывает сам.
 */
function syncMediaSession(): void {
  const bridge = mediaSession();
  if (playerBar.hidden) {
    bridge.clear();
    return;
  }
  bridge.update({
    title: nowTitle.textContent ?? "",
    artist: nowShow.textContent ?? "",
    artwork: player.isRecordingPlayback ? null : lastPlayed?.logo ?? null,
  });
  bridge.setPlaying(!videoEl.paused);
}

function mediaSession(): MediaSessionBridge {
  if (mediaSessionBridge) return mediaSessionBridge;
  const session = (navigator as Navigator & { mediaSession?: MediaSessionLike }).mediaSession ?? null;
  const Metadata = (window as Window & { MediaMetadata?: new (init: object) => unknown }).MediaMetadata;
  const run = (action: MediaKeyAction) => (): void => {
    if (!playerBar.hidden && allowMediaAction(action)) applyMediaKey(action);
  };
  mediaSessionBridge = createMediaSessionBridge(session && Metadata ? session : null, (init) => new Metadata!(init), {
    play: run("play"),
    pause: run("pause"),
    stop: () => { if (!playerBar.hidden) btnClosePlayer.click(); },
    nexttrack: run("next"),
    previoustrack: run("previous"),
    seekforward: run("forward"),
    seekbackward: run("backward"),
  });
  return mediaSessionBridge;
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
  if (!guideOverlay.hidden && guideUi.isGrid()) timelineGuideUi?.refresh();
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
    if (menuOpen || scrubUi.isDragging() || document.activeElement === scrub) {
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
  if (allPlaylists) {
    refreshBusy = true; btnRefreshNow.setAttribute("aria-busy", "true");
    try { await activateAllPlaylists(true); if (!silentOnNoChange) pushNotification(tr("playlist.all") + " · " + tr("refresh.updatedPlain")); }
    finally { refreshBusy = false; btnRefreshNow.removeAttribute("aria-busy"); saveLastCheck(Date.now(), localStorage); }
    return;
  }
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
        const parsed = await loadEpgSources(dataProxied(epgUrls), (completed, total) => {
          if (!epgLoad.isCurrent()) return;
          epgNow.hidden = false;
          setSystemText(epgNow, total === 1 ? tr("loading.epg") : tr("loading.epgSources", { completed, total }));
        });
        if (epgLoad.isCurrent()) {
          epg = parsed;
          const cached = playlistCache.get(item.id);
          if (cached) cached.epg = parsed;
          epg = new Map([...aggregatePlaylists(aggregateSources()).epg, ...parsed]);
          programmes = countProgrammes(parsed);
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
        playlistCache.set(item.id, { snapshot: fresh, epg: playlistCache.get(item.id)?.epg ?? null });
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
  if (allPlaylists) {
    const id = snapshot.channels.find(c => c.url === url)?.source?.id;
    if (!id || snapshot.channels.find(c => c.url === target)?.source?.id !== id) return;
    const saved = loadFavoritesFor(id);
    const order = applyFavoritesOrder(playlistCache.get(id)!.snapshot.channels, saved, parseFavoritesOrder(localStorage.getItem(favoritesOrderKey(id)))).map(c => c.url);
    try { localStorage.setItem(favoritesOrderKey(id), JSON.stringify(moveFavorite(order, url, target))); } catch { /* текущая сессия */ }
    updateAggregate(); renderChannels(false); return;
  }
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
  if (allPlaylists) {
    aggregateFilter = { search: searchInput.value, category: activeCategory, view: activeView, scroll: channelList.scrollTop };
    allPlaylists = false; ++aggregateRequest;
    const cached = playlistCache.get(id);
    if (cached) {
      const combined = aggregatePlaylists(aggregateSources()).epg;
      playlistContext(id); snapshot = cached.snapshot; epg = new Map([...combined, ...(cached.epg ?? [])]);
      epgNow.hidden = true;
      activeCategory = null; searchInput.value = "";
      renderNav(); renderCategories(); renderChannels(); renderPlaylistSwitcher(); refreshNowFav(); return;
    }
  }
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
// Решение «что перечитать» — applyStorageChange в cross-tab.ts (#371),
// здесь только реакции над состоянием main.ts.
const storageReactions: Record<StorageReaction, () => void> = {
  groups: () => {
    const previousHidden = groupPreferences.hidden;
    groupPreferences = parseGroupPreferences(localStorage.getItem(groupPreferencesKey(plState.activeId!)));
    refreshGroupPreferences(previousHidden);
  },
  pins: () => {
    parentalPins = parseParentalPins(localStorage.getItem(parentalPinsKey(plState.activeId!)));
    // Изменение защиты в другой вкладке отменяет ранее разрешённый просмотр.
    if ((lastPlayed?.source?.id ?? plState.activeId) === plState.activeId) btnClosePlayer.click();
    activeCategory = null;
    renderPinSettings();
    renderCategories();
    renderChannels();
  },
  playlists: () => {
    const prevActive = plState.activeId;
    const previous = plState.items;
    plState = loadPlaylists(localStorage);
    for (const item of previous) {
      const updated = plState.items.find(p => p.id === item.id);
      if (!updated || JSON.stringify(updated) !== JSON.stringify(item)) playlistCache.delete(item.id);
    }
    if (allPlaylists) {
      if (lastPlayed?.source && !plState.items.some(item => item.id === lastPlayed!.source!.id)) btnClosePlayer.click();
      if (plState.activeId) playlistContext(plState.activeId);
      void activateAllPlaylists(); return;
    }
    renderPlaylistManager();
    renderPlaylistSwitcher();
    if (plState.activeId !== prevActive) {
      const pl = activePlaylist(plState);
      if (pl) activatePlaylist(pl.id);
      else showSetup();
    }
  },
  favorites: () => {
    favorites = loadFavoritesFor(plState.activeId!);
    favoritesOrder = loadFavoritesOrderFor(plState.activeId!);
    updateAggregate();
    refreshNowFav();
    if (showsChannelList(activeView)) renderChannels(false);
  },
  theme: () => {
    currentTheme = themeChoice(localStorage) === "system"
      ? resolveTheme(null, systemPrefersDark())
      : (themeChoice(localStorage) as Theme);
    applyTheme(currentTheme);
    setIcon(btnTheme, themeButtonLabel(currentTheme));
    renderThemeSeg();
  },
};
window.addEventListener("storage", (e) => {
  if (allPlaylists && e.key !== null && plState.items.some(item => item.id !== plState.activeId &&
    [groupPreferencesKey(item.id), channelOverridesKey(item.id), parentalPinsKey(item.id), channelHealthKey(item.id), favoritesKey(item.id)].includes(e.key!))) {
    pinDialog.cancel(); ++playRequest;
    updateAggregate(); renderCategories(); renderChannels(false); renderPlaylistSwitcher();
  }
  const playingSource = lastPlayed?.source;
  if (playingSource && playingSource.id !== plState.activeId && (e.key === parentalPinsKey(playingSource.id) ||
      (e.key === groupPreferencesKey(playingSource.id) && parseGroupPreferences(localStorage.getItem(e.key)).hidden.has(playingSource.group)))) btnClosePlayer.click();
  applyStorageChange(
    e.key,
    () => {
      const id = plState.activeId;
      return id
        ? { groups: groupPreferencesKey(id), pins: parentalPinsKey(id), favorites: favoritesKey(id), favoritesOrder: favoritesOrderKey(id) }
        : null;
    },
    (reaction) => storageReactions[reaction](),
  );
});

/** Пересобрать список плейлистов (setup-экран), синхронизировав состояние. */
function renderPlaylistManager(): void {
  playlistUi.renderManager(plState);
}

// ---------- Экспорт / импорт настроек — src/backup-ui.ts (#370) ----------
const backupUi = createBackupUi({
  nodes: { exportBtn: btnExport, exportFavBtn: btnExportFav, importBtn: btnImport, importFile },
  storage: localStorage,
  session: sessionStorage,
  playlists: () => plState.items,
  activeId: () => plState.activeId,
  favorites: loadFavoritesFor,
  channels: () => (allPlaylists && plState.activeId ? playlistCache.get(plState.activeId)?.snapshot : snapshot)?.channels ?? null,
  theme: () => themeChoice(localStorage),
  language: () => currentLanguage,
  localFs: playlistOpfsFs,
  toast: showToast,
  notify: pushNotification,
  beforeExport: saveCurrentPosition,
  beforeImport: async () => {
    stopIfRecording();
    await scheduleUi?.prepareImport();
    closeMultiView(false);
    lastPlayed = null;
    archivePlayback = null;
    player.stop(); // A late pause/pagehide must not overwrite imported positions.
  },
  reload: () => {
    const url = new URL(location.href);
    for (const key of ["p", "e", "ch"]) url.searchParams.delete(key);
    history.replaceState(null, "", url);
    location.reload();
  },
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
  if (!file) return;
  await importLocalPlaylistText(defaultLocalName(file.name), await file.text());
});

/**
 * Импорт локального плейлиста: файл из настроек, «Открыть с помощью»,
 * перетаскивание и Android-интент (#373) — содержимое уходит в OPFS.
 */
async function importLocalPlaylistText(name: string, content: string): Promise<void> {
  const fs = getLocalFs();
  if (!fs) {
    showSetup(tr("error.opfs"));
    return;
  }
  if (!looksLikeM3U(content)) {
    showSetup(tr("error.m3u"));
    return;
  }
  const pl = addLocalPlaylist(plState, name);
  plState = pl;
  const id = pl.items[pl.items.length - 1]!.id;
  await saveLocalPlaylist(await fs, id, content, null);
  savePlaylists(localStorage, plState);
  renderPlaylistManager();
  activatePlaylist(id);
}

// «Открыть с помощью» установленного PWA (file_handlers): launchQueue отдаёт
// файлы один раз на запуск.
(window as Window & { launchQueue?: { setConsumer(cb: (params: { files?: readonly FileSystemFileHandle[] }) => void): void } })
  .launchQueue?.setConsumer((params) => {
    void (async () => {
      for (const handle of params.files ?? []) {
        if (!isPlaylistFileName(handle.name)) continue;
        const file = await handle.getFile();
        await importLocalPlaylistText(defaultLocalName(file.name), await file.text());
      }
    })();
  });

// Перетаскивание .m3u в окно — тот же импорт, с подтверждением имени.
window.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
});
window.addEventListener("drop", (event) => {
  const file = [...(event.dataTransfer?.files ?? [])].find((item) => isPlaylistFileName(item.name));
  if (!file) return;
  event.preventDefault();
  const name = window.prompt(tr("incoming.dropName"), defaultLocalName(file.name));
  if (name === null) return;
  void file.text().then((content) => importLocalPlaylistText(name.trim() || defaultLocalName(file.name), content));
});

// Android-приложение передаёт файл из интента «Открыть с помощью» (#373).
(window as Window & { iptvHubImportPlaylist?: (name: string, content: string) => void }).iptvHubImportPlaylist =
  (name, content) => void importLocalPlaylistText(defaultLocalName(name), content);

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
    if (plState.activeId) playlistCache.set(plState.activeId, { snapshot, epg: null });
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
    loadEpgSources(dataProxied(finalEpgUrls), (completed, total) => {
      if (!epgLoad.isCurrent()) return;
      setSystemText(epgNow, total === 1 ? tr("loading.epg") : tr("loading.epgSources", { completed, total }));
    })
      .then((parsed) => {
        if (!epgLoad.isCurrent()) return;
        epg = parsed;
        if (plState.activeId && snapshot) playlistCache.set(plState.activeId, { snapshot, epg: parsed });
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

// ---------- Компаньон для http-плейлистов (#452, #465) ----------
// Opt-in: запрос Chrome о доступе к локальной сети видят только те, кто
// включил режим. В Android-приложении раздел скрыт — там встроенный прокси.
let companionEnabled = loadCompanionEnabled(localStorage);
let companionStatus: CompanionStatus = { state: "off" };
const companionUi = createCompanionUi({
  nodes: {
    section: $("companion-settings"),
    toggle: $<HTMLInputElement>("companion-enabled"),
    status: $("companion-status"),
    downloads: $("companion-downloads"),
    retry: $<HTMLButtonElement>("companion-retry"),
  },
  language: () => currentLanguage,
  platform: detectPlatform(navigator.userAgent, navigator.platform),
  onToggle: (enabled) => {
    companionEnabled = enabled;
    saveCompanionEnabled(localStorage, enabled);
    void refreshCompanion(true);
  },
  onRetry: () => void refreshCompanion(true),
});
$("companion-settings").hidden = isAppPage(location.href);

/** Подключиться к компаньону (или отключиться); reload — перечитать плейлист. */
async function refreshCompanion(reload: boolean): Promise<void> {
  if (isAppPage(location.href)) return;
  const before = hasLocalProxy(location.href);
  if (companionEnabled) {
    companionUi.render(companionStatus, true, true);
    companionStatus = await connectCompanion((url, init) => fetch(url, init));
  } else {
    companionStatus = { state: "off" };
  }
  setCompanionPairing(companionStatus.state === "connected" ? companionStatus.pairing : null);
  setPublicHttpAllowed(hasLocalProxy(location.href));
  companionUi.render(companionStatus, companionEnabled, false);
  // http-каналы появились или исчезли — перечитываем активный плейлист.
  const playlist = activePlaylist(plState);
  if (reload && playlist && before !== hasLocalProxy(location.href)) void openPlaylist(playlist.playlistUrl, playlist.epgUrl);
}

async function bootstrap(): Promise<void> {
  renderPlaylistManager();
  renderPlaylistSwitcher();

  // Компаньон (#465): ссылка из трея ?companion=1 включает режим; подключаемся
  // до загрузки плейлиста, чтобы http-каналы сразу шли через 127.0.0.1.
  const companionParam = takeCompanionParam(window.location.search);
  if (companionParam.enable) {
    companionEnabled = true;
    saveCompanionEnabled(localStorage, true);
    history.replaceState(null, "", `${window.location.pathname}${companionParam.search}${window.location.hash}`);
  }
  await refreshCompanion(false);

  // «Поделиться → IPTV Hub» (share_target, #373): ссылка становится ?p=.
  const shared = shareTargetSearch(window.location.search);
  if (shared !== null) history.replaceState(null, "", `${window.location.pathname}${shared}${window.location.hash}`);

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
const apkUpdatesSection = $("apk-updates-settings");
const apkUpdatesToggle = $<HTMLInputElement>("apk-check-updates");
function loadAppSettings(): ReturnType<typeof parseAppSettings> {
  try { return parseAppSettings(localStorage.getItem(APP_SETTINGS_KEY)); }
  catch { return parseAppSettings(null); }
}
let appSettings = loadAppSettings();
apkUpdatesSection.hidden = !localOrigin;
apkUpdatesToggle.checked = appSettings.checkUpdates;
const apkUpdateChecker = createApkUpdateChecker({
  android: localOrigin,
  local: { version: __APP_VERSION__, versionCode: __APP_VERSION_CODE__ },
  enabled: () => appSettings.checkUpdates,
  fetcher: (url, init) => fetch(url, init),
  onUpdate: version => notifBellUi.push(tr("updates.available", { version: version.version }), undefined, version.version),
});
apkUpdatesToggle.addEventListener("change", () => {
  appSettings = { checkUpdates: apkUpdatesToggle.checked };
  try { localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings)); }
  catch { showToast(tr("settings.unsaved")); }
  void apkUpdateChecker.check();
});
window.addEventListener("storage", event => {
  if (event.key !== null && event.key !== APP_SETTINGS_KEY) return;
  appSettings = loadAppSettings();
  apkUpdatesToggle.checked = appSettings.checkUpdates;
  void apkUpdateChecker.check();
});
apkUpdateChecker.start();
tvUi = createTvUi({
  doc: document, video: videoEl, player: playerBar,
  enabled: new URLSearchParams(location.search).get("tv") === "1",
  moveChannel: delta => {
    const index = focusedChannelIndex();
    const next = index + delta;
    if (index < 0 || next < 0 || next >= visibleResults.length) return false;
    focusChannelAt(next); return true;
  },
  back: () => {
    if (numericZap) { cancelNumericZap(); return true; }
    if (!catMenu.hidden) { catMenu.hidden = true; return true; }
    if (!playlistUiNodes.plSwitchMenu.hidden) { playlistUiNodes.plSwitchMenu.hidden = true; return true; }
    const overlay = topOverlay(overlayStack);
    if (overlay) { closeOverlay(overlay); return true; }
    if (!playerBar.hidden) { btnClosePlayer.click(); return true; }
    return false;
  },
  info: () => {
    const programme = epg && lastPlayed && snapshot ? getNowNext(epg, lastPlayed, snapshot) : null;
    return { channel: nowTitle.textContent ?? "",
      now: programme?.now ? tr("tv.now", { title: programme.now.title }) : "",
      next: programme?.next ? tr("tv.next", { title: programme.next.title }) : "" };
  },
});
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
  backupUi.reportImport();
});
