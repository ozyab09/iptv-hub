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
const audioSelect = $<HTMLSelectElement>("audio-select");
const subtitleSelect = $<HTMLSelectElement>("subtitle-select");
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
const player = new Player(videoEl, showToast, () => {
  refreshQualityUi();
  refreshPlayerStatus();
});

// ---------- UI helpers ----------
function showToast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  window.setTimeout(() => {
    toastEl.hidden = true;
  }, 3500);
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

// ---------- Рендер каналов ----------
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
  channelList.textContent = "";
  emptyState.hidden = sorted.length > 0;
  for (const c of sorted) {
    channelList.append(renderChannelCard(c));
  }
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
  nowTitle.textContent = c.name;
  nowTitle.title = c.url; // ссылка на поток текущего канала
  nowCategory.textContent = c.group;
  playerBar.hidden = false;
  refreshNowFav();
  btnPause.textContent = "❚❚"; // после play() обычно идёт воспроизведение
  playerStatus.textContent = "—";
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
  }
});

// ---- Качество / дорожки / статус-бар (живут, пока играет hls-поток) ----

/** Перестроить селект качества + дорожки после смены канала. */
function refreshQualityUi(): void {
  const hls = player.getHls();
  qualityMenu.textContent = "";
  audioSelect.textContent = "";
  subtitleSelect.textContent = "";

  if (!hls) {
    // нативный playback (Safari/iOS, mp4): выбор качества/дорожек недоступен
    qualityBtn.disabled = true;
    qualityBtn.textContent = "Auto";
    qualityMenu.hidden = true;
    audioSelect.hidden = true;
    subtitleSelect.hidden = true;
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
  audioSelect.hidden = audioTracks.length < 2;
  if (audioTracks.length >= 2) {
    audioTracks.forEach((t, i) =>
      audioSelect.append(new Option(trackLabel(t, i), String(i))),
    );
    audioSelect.value = String(hls.audioTrack);
  }

  const subTracks = hls.subtitleTracks ?? [];
  subtitleSelect.hidden = subTracks.length === 0;
  if (subTracks.length > 0) {
    subtitleSelect.append(new Option("Выключены", "-1"));
    subTracks.forEach((t, i) =>
      subtitleSelect.append(new Option(trackLabel(t, i), String(i))),
    );
    subtitleSelect.value = String(hls.subtitleTrack);
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

audioSelect.addEventListener("change", () => {
  player.setAudioTrack(Number(audioSelect.value));
});
subtitleSelect.addEventListener("change", () => {
  player.setSubtitleTrack(Number(subtitleSelect.value));
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
  window.clearInterval(recordRaf);
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
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
    // MSE-видео нельзя записать напрямую — рисуем кадры на canvas
    recordCanvas = document.createElement("canvas");
    recordCanvas.width = videoEl.videoWidth || 1280;
    recordCanvas.height = videoEl.videoHeight || 720;
    const ctx = recordCanvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d недоступен");
    recordRaf = window.setInterval(
      () => ctx.drawImage(videoEl, 0, 0, recordCanvas!.width, recordCanvas!.height),
      1000 / 25,
    );
    const stream = recordCanvas.captureStream(25);
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      // Классическое сохранение: a[download] с готовым именем. Без prompt.
      // Если браузер настроен «спрашивать, куда сохранять» — покажет свой
      // диалог (это его настройка, см. README), файл НЕ теряется.
      const blob = new Blob(recordedChunks, { type: mime.split(";")[0] });
      recordedChunks = [];
      console.debug(
        `[iptv-hub] запись завершена: ${blob.size} байт, mime=${mime}, chunks=${recordedChunks.length}`,
      );
      if (blob.size === 0) {
        showToast("Запись пустая — поток не отдал кадров (см. консоль F12)");
        return;
      }
      const name = recordingFileName(lastPlayed?.name ?? "recording");
      const url = URL.createObjectURL(blob);

      // Firefox: a.click() из асинхронного onstop (вне user gesture) иногда
      // молча глотается; повторяем попытку несколько раз и держим анкор в DOM.
      const tryDownload = (attempt: number): void => {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.rel = "noopener";
        document.body.append(a);
        a.click();
        a.remove();
        if (attempt < 4) {
          window.setTimeout(() => tryDownload(attempt + 1), 300);
        }
      };
      tryDownload(0);
      // revoke позже: повторные клики и медленный Firefox должны успеть
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      showToast(`Запись сохранена: ${name}`);
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

// ---------- Поиск ----------
searchInput.addEventListener("input", () => renderChannels());

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
      const newName = window.prompt("Название:", p.name);
      if (newName === null) return;
      const newUrl = window.prompt("URL плейлиста:", p.playlistUrl);
      if (newUrl === null) return;
      if (!/^https?:\/\//.test(newUrl.trim())) {
        showSetup("Нужен http(s)-URL плейлиста");
        return;
      }
      const newEpg = window.prompt("URL EPG (пусто — без EPG):", p.epgUrl ?? "");
      if (newEpg === null) return;
      plState = updatePlaylist(plState, p.id, {
        name: newName.trim() || p.name,
        playlistUrl: newUrl.trim(),
        epgUrl: newEpg.trim() || null,
      });
      savePlaylists(localStorage, plState);
      renderPlaylistManager();
      renderPlaylistSwitcher();
      // Если редактировали активный — перезагрузим его по «Вернуться»
      btnBackToPlayer.hidden = !activePlaylist(plState);
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
