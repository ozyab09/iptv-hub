import "./style.css";
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
import { computeWindow, spacerHeight } from "./virtual-list";
import { neighborIndex, Player, seekBy } from "./player";
import {
  applyTheme,
  resolveTheme,
  saveTheme,
  themeButtonLabel,
  toggleTheme,
  type Theme,
} from "./theme";
import {
  buildBackup,
  parseBackup,
  pushRecent,
} from "./backup";
import {
  canRecord,
  pickRecorderMime,
  recordingFileName,
  validateRecOp,
  type RecState,
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
import type { Channel, PlaylistSnapshot } from "./types";

// ---------- DOM ----------
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} не найден`);
  return el as T;
};

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
const btnManage = $<HTMLButtonElement>("btn-manage");
const btnBackToPlayer = $<HTMLButtonElement>("btn-back-to-player");
const setupError = $("setup-error");
const searchInput = $<HTMLInputElement>("search");
const categoriesNav = $("categories");
const channelList = $("channel-list");
const emptyState = $("empty-state");
const epgNow = $("epg-now");
const playerBar = $("player-bar");
const videoEl = $<HTMLVideoElement>("video");
const nowTitle = $("now-title");
const nowCategory = $("now-category");
const toastEl = $("toast");
const btnClosePlayer = $<HTMLButtonElement>("btn-close-player");
const btnExpand = $<HTMLButtonElement>("btn-expand");
const btnFullscreen = $<HTMLButtonElement>("btn-fullscreen");
const btnRetry = $<HTMLButtonElement>("btn-retry");
const btnExport = $<HTMLButtonElement>("btn-export");
const btnImport = $<HTMLButtonElement>("btn-import");
const importFile = $<HTMLInputElement>("import-file");
const recentsBlock = $("recents-block");
const recentsList = $("recents-list");
const btnFavorites = $<HTMLButtonElement>("btn-favorites");
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
let favFilter = false;
/** Плоский список каналов в текущем рендере — для prev/next в плеере. */
let visibleChannels: Channel[] = [];
/** Недавно просмотренные (url → имя берём из snapshot при рендере). */
let recents: string[] = [];
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
  },
);

// ---------- UI helpers ----------
function showToast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  window.setTimeout(() => {
    toastEl.hidden = true;
  }, 3500);
}

/** Тост с кнопкой действия (для Firefox-скачивания нужен новый user gesture). */
function showToastAction(
  msg: string,
  actionLabel: string,
  action: () => void,
  durationMs = 15_000,
): void {
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
    toastEl.hidden = true;
  }, durationMs);
}

function showSetup(message?: string): void {
  if (message) {
    setupError.textContent = message;
    setupError.hidden = false;
  }
  playerScreen.hidden = true;
  setupScreen.hidden = false;
}

function showPlayer(): void {
  setupScreen.hidden = true;
  playerScreen.hidden = false;
}

/** Экран менеджера плейлистов (плеер продолжает играть в фоне). */
function showManager(): void {
  setupError.hidden = true;
  renderPlaylistManager();
  renderPlaylistSwitcher();
  btnBackToPlayer.hidden = !activePlaylist(plState);
  playerScreen.hidden = true;
  setupScreen.hidden = false;
}

btnManage.addEventListener("click", () => {
  const wasHidden = playerScreen.hidden;
  if (wasHidden) {
    showPlayer(); // менеджер уже открыт — сворачиваем обратно
  } else {
    showManager();
  }
});

btnBackToPlayer.addEventListener("click", () => {
  const active = activePlaylist(plState);
  if (active) void openPlaylist(active.playlistUrl, active.epgUrl);
  else showSetup();
});

// ---------- Рендер категорий ----------
function renderCategories(): void {
  if (!snapshot) return;
  categoriesNav.textContent = "";
  btnFavorites.classList.toggle("active", favFilter);
  btnFavorites.setAttribute("aria-pressed", String(favFilter));
  btnFavorites.textContent = favFilter
    ? "★ Показать все"
    : "☆ Показать избранное";
  const mk = (label: string, value: string | null, count: number) => {
    const b = document.createElement("button");
    b.textContent = `${label} (${count})`;
    b.className =
      activeCategory === value ? "category-btn active" : "category-btn";
    b.addEventListener("click", () => {
      activeCategory = value;
      renderCategories();
      renderChannels();
    });
    return b;
  };
  categoriesNav.append(
    mk("Все", null, snapshot.channels.length),
    ...snapshot.categories.map((g) =>
      mk(
        g,
        g,
        snapshot!.channels.filter((c) => c.group === g).length,
      ),
    ),
  );
}

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
  );
  virtualSpacer.style.height = `${spacerHeight(visibleChannels.length)}px`;
  virtualInner.style.transform = `translateY(${win.offset}px)`;
  virtualInner.textContent = "";
  for (let i = win.start; i < win.start + win.count; i++) {
    const c = visibleChannels[i];
    if (c) virtualInner.append(renderChannelCard(c));
  }
}

function renderChannels(): void {
  if (!snapshot) return;
  const q = searchInput.value.trim().toLowerCase();
  const list = snapshot.channels.filter((c) => {
    if (activeCategory && c.group !== activeCategory) return false;
    if (!q) return true;
    return (
      c.normalizedName.includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q)
    );
  });
  const sorted = applyFavorites(list, favorites, favFilter);
  visibleChannels = sorted;
  emptyState.hidden = sorted.length > 0;
  ensureVirtualShell();
  // при смене фильтра сбрасываем прокрутку, чтобы окно пересчиталось с нуля
  channelList.scrollTop = 0;
  renderVirtualWindow();
}

function renderChannelCard(c: Channel): HTMLElement {
  const card = document.createElement("button");
  card.className = "channel-card";
  card.setAttribute("role", "listitem");

  if (c.logo) {
    const img = document.createElement("img");
    img.src = c.logo;
    img.alt = "";
    img.loading = "lazy";
    img.className = "channel-logo";
    img.addEventListener("error", () => img.remove());
    card.append(img);
  }

  const name = document.createElement("span");
  name.className = "channel-name";
  name.textContent = c.name;
  name.title = c.url; // ссылка на поток при наведении
  card.append(name);

  const star = document.createElement("button");
  star.className = isFavorite(favorites, c)
    ? "fav-star active"
    : "fav-star";
  star.title = isFavorite(favorites, c)
    ? "Убрать из избранного"
    : "В избранное";
  star.setAttribute("aria-label", star.title);
  star.textContent = isFavorite(favorites, c) ? "★" : "☆";
  star.addEventListener("click", (ev) => {
    ev.stopPropagation(); // не запускать воспроизведение
    favorites = toggleFavorite(favorites, c);
    if (plState.activeId) saveFavoritesFor(plState.activeId);
    refreshNowFav();
    renderCategories();
    renderChannels();
  });
  card.append(star);

  if (c.quality) {
    const q = document.createElement("span");
    q.className = `badge q-${c.quality.toLowerCase()}`;
    q.textContent = c.quality;
    card.append(q);
  }

  if (epg) {
    const { now } = getNowNext(epg, c, snapshot!);
    if (now) {
      const e = document.createElement("span");
      e.className = "channel-epg";
      e.textContent = `${formatRange(now)} · ${now.title}`;
      card.append(e);
    }
  }

  card.addEventListener("click", () => playChannel(c));
  return card;
}

// ---------- Плеер ----------
function playChannel(c: Channel): void {
  // Смена канала во время записи: сохраняем записанный кусок старого канала.
  if (recState === "recording" && lastPlayed && lastPlayed.url !== c.url) {
    stopRecording(true);
    showToast("Запись остановлена: канал переключён");
  }
  lastPlayed = c;
  // recents: дедап по url, максимум RECENTS_MAX, хранение per-плейлист
  recents = pushRecent(recents, c.url);
  if (plState.activeId) {
    try {
      localStorage.setItem(
        `iptv-hub.recents.v1:${plState.activeId}`,
        JSON.stringify(recents),
      );
    } catch { /* приватный режим */ }
    renderRecents();
  }
  nowTitle.textContent = c.name;
  nowTitle.title = c.url; // ссылка на поток текущего канала
  nowCategory.textContent = c.group;
  playerBar.hidden = false;
  refreshNowFav();
  btnPause.textContent = "❚❚"; // после play() обычно идёт воспроизведение
  playerStatus.textContent = "—";
  btnRetry.hidden = true; // новый канал — сбрасываем retry-статус
  if (!player.play(c)) {
    showToast("Формат потока не поддерживается");
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
  if (recState === "recording") {
    stopRecording(true); // закрытие плеера — тоже сохраняем записанное
    showToast("Запись остановлена: плеер закрыт");
  }
  if (document.fullscreenElement) void document.exitFullscreen();
  player.stop();
  playerBar.hidden = true;
  lastPlayed = null;
  renderChannels();
});

btnPause.addEventListener("click", () => {
  player.togglePause();
});
videoEl.addEventListener("play", () => (btnPause.textContent = "❚❚"));
videoEl.addEventListener("pause", () => (btnPause.textContent = "▶"));
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
  btnMute.textContent = player.getVolume() === 0 ? "🔇" : "🔊";
  volumeSlider.value = String(Math.round(player.getVolume() * 100));
});
volumeSlider.addEventListener("input", () => {
  player.setVolume(Number(volumeSlider.value) / 100);
  btnMute.textContent = player.getVolume() === 0 ? "🔇" : "🔊";
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
  nowFav.textContent = fav ? "★" : "☆";
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
  if (playerBar.hidden) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
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
      btnMute.textContent = "🔊";
      break;
    case "ArrowDown":
      e.preventDefault();
      volumeSlider.value = String(
        Math.max(0, Number(volumeSlider.value) - 10),
      );
      player.setVolume(Number(volumeSlider.value) / 100);
      btnMute.textContent =
        Number(volumeSlider.value) === 0 ? "🔇" : "🔊";
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
    b.className = active ? "quality-item active" : "quality-item";
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
        i === hls.audioTrack ? "quality-item active" : "quality-item";
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
      hls.subtitleTrack === -1 ? "quality-item active" : "quality-item";
    off.textContent = "Выключены";
    off.addEventListener("click", () => {
      player.setSubtitleTrack(-1);
      subtitleMenu.hidden = true;
    });
    subtitleMenu.append(off);
    subTracks.forEach((t, i) => {
      const b = document.createElement("button");
      b.className =
        i === hls.subtitleTrack ? "quality-item active" : "quality-item";
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
  if (recState === "recording") {
    stopRecording(true);
    showToast("Запись остановлена: плейлист переключён");
  }
}

// ---- Запись эфира (MediaRecorder поверх captureStream) ----
let recState: RecState = "idle";
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let recordCanvas: HTMLCanvasElement | null = null;
let recordRaf = 0;

function stopRecording(save: boolean): void {
  window.cancelAnimationFrame(recordRaf);
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    console.debug(`[iptv-hub] rec: stop из state=${mediaRecorder.state}`);
    mediaRecorder.stop();
  }
  if (recordCanvas) {
    const stream = recordCanvas.captureStream();
    stream.getTracks().forEach((t) => t.stop());
    recordCanvas = null;
  }
  btnRec.classList.remove("recording");
  btnRec.title = "Записать эфир в файл";
  recState = "idle";
  if (!save) recordedChunks = [];
}

// Единый toggle: старт из idle, стоп+сохранение из recording.
// (Раньше здесь жили два обработчика — addEventListener + onclick — и оба
// срабатывали на один клик, показывая ложный тост «Запись уже идёт».)
btnRec.addEventListener("click", () => {
  if (recState === "recording") {
    const stopErr = validateRecOp(recState, "stop");
    if (stopErr) {
      showToast(stopErr);
      return;
    }
    stopRecording(true);
    return;
  }

  if (!lastPlayed) return;
  const err = validateRecOp(recState, "start");
  if (err) {
    showToast(err);
    return;
  }
  const mime = pickRecorderMime();
  if (!mime || !canRecord()) {
    showToast("Запись не поддерживается этим браузером");
    return;
  }
  try {
    // MSE-видео нельзя записать напрямую — рисуем кадры на canvas.
    // requestAnimationFrame вместо setInterval: Firefox/Zen троттлят setInterval
    // в фоне до 1/с, captureStream(25) перестаёт отдавать кадры → пустая запись.
    recordCanvas = document.createElement("canvas");
    recordCanvas.width = videoEl.videoWidth || 1280;
    recordCanvas.height = videoEl.videoHeight || 720;
    const ctx = recordCanvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d недоступен");
    const drawFrame = (): void => {
      if (!recordCanvas) return;
      ctx.drawImage(videoEl, 0, 0, recordCanvas.width, recordCanvas.height);
      recordRaf = window.requestAnimationFrame(drawFrame);
    };
    drawFrame();
    const stream = recordCanvas.captureStream(25);
    const [track] = stream.getVideoTracks();
    console.debug(
      `[iptv-hub] rec: track=${track?.label ?? "?"} muted=${track?.muted} readyState=${track?.readyState}`,
    );
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      console.debug(`[iptv-hub] rec: chunk ${e.data.size}B (${mediaRecorder?.state})`);
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onerror = (ev) => {
      console.error("[iptv-hub] MediaRecorder error:", (ev as unknown as { error?: Error }).error);
      showToast("Ошибка записи (подробности в консоли F12)");
    };
    mediaRecorder.onstop = () => {
      // Классическое сохранение: a[download] с готовым именем. Без prompt.
      // Если браузер настроен «спрашивать, куда сохранять» — покажет свой
      // диалог (это его настройка, см. README), файл НЕ теряется.
      const blob = new Blob(recordedChunks, { type: mime.split(";")[0] });
      const chunkCount = recordedChunks.length;
      recordedChunks = [];
      console.debug(
        `[iptv-hub] onstop: ${blob.size} байт, mime=${mime}, chunks=${chunkCount}`,
      );
      if (blob.size === 0) {
        showToast(
          `Запись пустая (${chunkCount} чанков, 0 байт) — вероятно, видео было скрыто/свёрнуто. Не сворачивайте вкладку при записи. Консоль F12: [iptv-hub]`,
        );
        return;
      }
      const name = recordingFileName(lastPlayed?.name ?? "recording");
      const url = URL.createObjectURL(blob);

      // Firefox: a.click() из асинхронного onstop (вне user gesture) молча
      // глотается — повторные клики не помогают. Надёжный путь — клик по кнопке
      // из тоста: это новый user gesture, скачивание гарантировано.
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      // Кнопка в тосте живёт 15с: если авто-скачивание не сработало (Firefox),
      // явный клик = свежий жест → загрузка начнётся наверняка.
      showToastAction(
        `Автоскачивание не началось?`,
        `Скачать ${name}`,
        () => {
          const a2 = document.createElement("a");
          a2.href = url;
          a2.download = name;
          a2.rel = "noopener";
          document.body.append(a2);
          a2.click();
          a2.remove();
        },
        15_000,
      );
    };
    mediaRecorder.start(2000);
    recState = "recording";
    btnRec.classList.add("recording");
    btnRec.title = "Остановить запись и сохранить файл";
    showToast("Запись началась");
  } catch (e) {
    stopRecording(false);
    showToast(`Не удалось начать запись: ${e instanceof Error ? e.message : "ошибка"}`);
  }
});

// ---- Гайд (программа передач) + catchup ----
let guideDayIdx = 0;

function openGuide(): void {
  if (!lastPlayed) return;
  guideTitle.textContent = `Программа · ${lastPlayed.name}`;
  guideDayIdx = 0;
  guideOverlay.hidden = false;
  renderGuide();
}

function renderGuide(): void {
  if (!lastPlayed) return;
  const wins = dayWindows();
  guideDays.textContent = "";
  wins.forEach((w, i) => {
    const b = document.createElement("button");
    b.textContent = w.label;
    b.className = i === guideDayIdx ? "guide-day active" : "guide-day";
    b.addEventListener("click", () => {
      guideDayIdx = i;
      renderGuide();
    });
    guideDays.append(b);
  });

  guideList.textContent = "";
  const window: DayWindow = wins[guideDayIdx]!;
  const progs = epg
    ? programmesInDay(
        epg.get(`id:${lastPlayed.tvgId?.toLowerCase() ?? ""}`) ??
          epg.get(`name:${lastPlayed.normalizedName}`) ??
          [],
        window,
      )
    : [];
  if (progs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Нет данных на этот день";
    guideList.append(empty);
    return;
  }

  const now = new Date();
  const cu = {
    days: lastPlayed.catchupDays,
    source: lastPlayed.catchupSource,
  };
  for (const p of progs) {
    const start = Date.parse(p.start);
    const stop = Date.parse(p.stop);
    const isLive = start <= now.getTime() && now.getTime() < stop;
    const watchable = isLive || canWatchPast(cu, p, now);

    const row = document.createElement("button");
    row.className =
      "guide-row" + (isLive ? " live" : "") + (watchable ? "" : " dim");
    const t = document.createElement("span");
    t.className = "guide-time";
    t.textContent = formatRange(p);
    const title = document.createElement("span");
    title.className = "guide-name";
    title.textContent = p.title + (isLive ? " ● сейчас" : "");
    row.append(t, title);

    if (watchable) {
      row.title = isLive
        ? "Смотреть сейчас"
        : "Смотреть из архива (catchup)";
      row.addEventListener("click", () => {
        if (isLive) {
          playChannel(lastPlayed!);
          guideOverlay.hidden = true;
          return;
        }
        const url = buildCatchupUrl(cu, p, now);
        if (!url) {
          showToast("Провайдер не дал шаблон архива для этого канала");
          return;
        }
        nowTitle.textContent = `${lastPlayed!.name} · архив`;
        nowTitle.title = url;
        playerBar.hidden = false;
        player.play({ ...lastPlayed!, url });
        guideOverlay.hidden = true;
      });
    } else {
      row.title =
        cu.days > 0
          ? "Вне глубины архива"
          : "Архив недоступен на этом канале (нет tvg-rec)";
    }
    guideList.append(row);
  }
}

btnGuide.addEventListener("click", openGuide);
guideClose.addEventListener("click", () => (guideOverlay.hidden = true));
guideOverlay.addEventListener("click", (e) => {
  if (e.target === guideOverlay) guideOverlay.hidden = true;
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !guideOverlay.hidden) guideOverlay.hidden = true;
});

// Театральный режим
btnExpand.addEventListener("click", () => {
  playerBar.classList.toggle("theater");
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
  btnFullscreen.textContent = document.fullscreenElement ? "⛶" : "⛶"; // глиф одинаков; меняем title
  btnFullscreen.title = document.fullscreenElement
    ? "Выйти из полного экрана (F)"
    : "На весь экран (F)";
});

// ---------- Поиск ----------
searchInput.addEventListener("input", () => renderChannels());

// ---------- Недавно просмотренные ----------
function renderRecents(): void {
  const urls = recents.filter((u) => visibleChannels.some((c) => c.url === u));
  recentsBlock.hidden = urls.length === 0;
  recentsList.textContent = "";
  for (const url of urls) {
    const ch = visibleChannels.find((c) => c.url === url);
    if (!ch) continue;
    const chip = document.createElement("button");
    chip.className = "recent-chip";
    chip.textContent = ch.name;
    chip.title = ch.group;
    chip.addEventListener("click", () => playChannel(ch));
    recentsList.append(chip);
  }
}

function loadRecentsFor(id: string): void {
  try {
    const raw = localStorage.getItem(`iptv-hub.recents.v1:${id}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    recents = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    recents = [];
  }
  renderRecents();
}

// ---------- Тема ----------
let currentTheme: Theme = resolveTheme(
  typeof localStorage !== "undefined" ? localStorage : null,
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : null,
);
applyTheme(currentTheme);
btnTheme.textContent = themeButtonLabel(currentTheme);
btnTheme.addEventListener("click", () => {
  currentTheme = toggleTheme(currentTheme);
  applyTheme(currentTheme);
  saveTheme(currentTheme, localStorage);
  btnTheme.textContent = themeButtonLabel(currentTheme);
});

// ---------- Избранное ----------
btnFavorites.addEventListener("click", () => {
  favFilter = !favFilter;
  renderCategories();
  renderChannels();
});

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
  favFilter = false;
  loadRecentsFor(id);
  const pl = activePlaylist(plState);
  if (pl) {
    void openPlaylist(pl.playlistUrl, pl.epgUrl);
  }
}

// ---------- Менеджер плейлистов (setup-экран) ----------
function renderPlaylistManager(): void {
  plList.textContent = "";
  if (plState.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Пока ни одного плейлиста — добавьте первый ниже.";
    plList.append(empty);
  }
  for (const p of plState.items) {
    const row = document.createElement("div");
    row.className = "pl-row" + (p.id === plState.activeId ? " active" : "");
    const name = document.createElement("div");
    name.className = "pl-name";
    name.textContent = p.name;
    const url = document.createElement("div");
    url.className = "pl-url muted";
    url.textContent = p.playlistUrl;
    name.append(url);
    const actions = document.createElement("div");
    actions.className = "pl-actions";
    const open = document.createElement("button");
    open.className = "primary pl-open";
    open.textContent = p.id === plState.activeId ? "Открыт" : "Открыть";
    open.disabled = p.id === plState.activeId;
    open.addEventListener("click", () => activatePlaylist(p.id));
    const edit = document.createElement("button");
    edit.className = "icon-btn";
    edit.title = "Переименовать / изменить ссылки";
    edit.textContent = "✎";
    edit.addEventListener("click", () => {
      // Инлайн-редактирование: карточка превращается в форму
      row.textContent = "";
      row.classList.add("editing");
      const form = document.createElement("div");
      form.className = "pl-edit";
      const mk = (label: string, value: string, type = "text"): HTMLInputElement => {
        const l = document.createElement("label");
        l.textContent = label;
        const input = document.createElement("input");
        input.type = type;
        input.value = value;
        l.append(input);
        form.append(l);
        return input;
      };
      const nameIn = mk("Название", p.name);
      const urlIn = mk("URL плейлиста", p.playlistUrl, "url");
      const epgIn = mk("URL EPG (необязательно)", p.epgUrl ?? "", "url");
      const btns = document.createElement("div");
      btns.className = "pl-edit-actions";
      const save = document.createElement("button");
      save.className = "primary pl-open";
      save.textContent = "Сохранить";
      const cancel = document.createElement("button");
      cancel.className = "icon-btn";
      cancel.textContent = "✕";
      cancel.title = "Отмена";
      btns.append(save, cancel);
      form.append(btns);
      row.append(form);
      nameIn.focus();

      const closeEditor = (): void => renderPlaylistManager();
      cancel.addEventListener("click", closeEditor);
      save.addEventListener("click", () => {
        const newName = nameIn.value.trim();
        const newUrl = urlIn.value.trim();
        const newEpg = epgIn.value.trim();
        if (!/^https?:\/\//.test(newUrl)) {
          setupError.textContent = "Нужен http(s)-URL плейлиста";
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
        btnBackToPlayer.hidden = !activePlaylist(plState);
      });
    });
    const del = document.createElement("button");
    del.className = "icon-btn pl-del";
    del.title = "Удалить плейлист (избранное тоже будет удалено)";
    del.textContent = "🗑";
    del.addEventListener("click", () => {
      if (!window.confirm(`Удалить «${p.name}»?`)) return;
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(favoritesKey(p.id));
      }
      plState = removePlaylist(plState, p.id);
      savePlaylists(localStorage, plState);
      renderPlaylistManager();
      renderPlaylistSwitcher();
    });
    actions.append(open, edit, del);
    row.append(name, actions);
    plList.append(row);
  }
}

// ---------- Экспорт / импорт настроек ----------
btnExport.addEventListener("click", () => {
  const favs: Record<string, string[]> = {};
  for (const p of plState.items) {
    const list = loadFavoritesFor(p.id);
    if (list.size > 0) favs[p.id] = [...list];
  }
  const backup = buildBackup({
    theme: document.documentElement.dataset.theme ?? "dark",
    playlists: plState.items,
    activeId: plState.activeId,
    favorites: favs,
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
  plSwitchBtn.textContent = `📺 ${active.name}`;
  plSwitchMenu.textContent = "";
  for (const p of plState.items) {
    const b = document.createElement("button");
    b.className =
      p.id === plState.activeId ? "quality-item active" : "quality-item";
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
setupLoad.addEventListener("click", () => {
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
      "⚠️ Плейлист по http://: страница открыта по https://, браузер может заблокировать запрос. Если загрузка упадёт — используйте https-ссылку.",
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
function describeFetchFailure(url: string): string {
  const mixed = isMixedContent(window.location.href, url);
  return mixed
    ? "Ссылка http://, а страница открыта по https:// — браузер блокирует " +
        "смешанный контент. Сохраните плейлист по https-ссылке или откройте " +
        "сайт по http (локально)."
    : "Возможные причины: (1) на бакете не включён CORS — добавьте правило для " +
        "origin https://ozyab09.github.io (см. README), (2) ссылка недоступна " +
        "из браузера (приватный бакет, firewall). Проверьте консоль (F12) — " +
        "там будет точная причина (blocked by CORS policy / net::ERR_…).";
}

/** Открыть плейлист: загрузка + рендер + EPG. Общая для boot/переключения. */
async function openPlaylist(url: string, epgUrl: string | null): Promise<void> {
  stopIfRecording();
  player.stop();
  playerBar.hidden = true;
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
  epgNow.textContent = `Каналов: ${snapshot.channels.length} · Категорий: ${snapshot.categories.length}`;

  const finalEpgUrl = epgUrl ?? snapshot.headerTvgUrl;
  if (finalEpgUrl) {
    epgNow.textContent += " · Загрузка телепрограммы…";
    loadEpg(finalEpgUrl)
      .then((parsed) => {
        epg = parsed;
        renderChannels();
        refreshNowFav();
        epgNow.textContent = `Каналов: ${snapshot!.channels.length} · Категорий: ${snapshot!.categories.length} · EPG ✓`;
      })
      .catch(() => {
        epgNow.textContent = `Каналов: ${snapshot!.channels.length} · Категорий: ${snapshot!.categories.length} · EPG недоступен`;
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
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              showToast("Доступно обновление — перезагрузите страницу");
            }
          });
        });
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

bootstrap();
