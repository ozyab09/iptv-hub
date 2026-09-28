import "./style.css";
import {
  isMixedContent,
  resolveConfig,
  saveConfig,
  STORAGE_KEY,
} from "./config";
import {
  applyFavorites,
  isFavorite,
  loadFavorites,
  saveFavorites,
  toggleFavorite,
} from "./favorites";
import { parseM3U } from "./m3u";
import { formatRange, getNowNext, loadEpg } from "./epg";
import { neighborIndex, Player } from "./player";
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
  sortLevelsDesc,
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
const btnMute = $<HTMLButtonElement>("btn-mute");
const volumeSlider = $<HTMLInputElement>("volume-slider");
const btnPip = $<HTMLButtonElement>("btn-pip");
const qualitySelect = $<HTMLSelectElement>("quality-select");
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

// ---------- Состояние ----------
let snapshot: PlaylistSnapshot | null = null;
let epg: Map<string, import("./types").EpgProgramme[]> | null = null;
let activeCategory: string | null = null;
let favorites = loadFavorites(typeof localStorage !== "undefined" ? localStorage : null);
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
    saveFavorites(localStorage, favorites);
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
  lastPlayed = c;
  nowTitle.textContent = c.name;
  nowTitle.title = c.url; // ссылка на поток текущего канала
  nowCategory.textContent = c.group;
  playerBar.hidden = false;
  btnPause.textContent = "⏸"; // после play() обычно идёт воспроизведение
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
  if (recState === "recording") stopRecording(false);
  player.stop();
  playerBar.hidden = true;
  lastPlayed = null;
  renderChannels();
});

btnPause.addEventListener("click", () => {
  player.togglePause();
});
videoEl.addEventListener("play", () => (btnPause.textContent = "⏸"));
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
  }
});

// ---- Качество / дорожки / статус-бар (живут, пока играет hls-поток) ----

/** Перестроить селект качества + дорожки после смены канала. */
function refreshQualityUi(): void {
  const hls = player.getHls();
  qualitySelect.textContent = "";
  audioSelect.textContent = "";
  subtitleSelect.textContent = "";

  if (!hls) {
    // нативный playback (Safari/iOS, mp4): селекты недоступны
    qualitySelect.append(new Option("Auto", "-1"));
    qualitySelect.disabled = true;
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

  qualitySelect.disabled = false;
  qualitySelect.append(new Option("Auto", "-1"));
  for (const l of sortLevelsDesc(hls.levels.map((lv, i) => ({ ...lv, index: i })))) {
    const opt = new Option(levelLabel(l), String(l.index));
    qualitySelect.append(opt);
  }
  qualitySelect.value = String(hls.autoLevelEnabled ? -1 : hls.currentLevel);

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

qualitySelect.addEventListener("change", () => {
  player.setLevel(Number(qualitySelect.value));
});
audioSelect.addEventListener("change", () => {
  player.setAudioTrack(Number(audioSelect.value));
});
subtitleSelect.addEventListener("change", () => {
  player.setSubtitleTrack(Number(subtitleSelect.value));
});

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

btnRec.addEventListener("click", () => {
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
      const blob = new Blob(recordedChunks, { type: mime.split(";")[0] });
      recordedChunks = [];
      if (blob.size === 0) {
        showToast("Запись пустая — поток не отдал кадров");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = recordingFileName(lastPlayed?.name ?? "recording");
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      showToast(`Запись сохранена: ${a.download}`);
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

  // Останавливающий клик по кнопке в состоянии recording
  btnRec.onclick = () => {
    const stopErr = validateRecOp(recState, "stop");
    if (stopErr) {
      showToast(stopErr);
      return;
    }
    stopRecording(true);
    btnRec.onclick = null;
  };
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

// ---------- Избранное ----------
btnFavorites.addEventListener("click", () => {
  favFilter = !favFilter;
  renderCategories();
  renderChannels();
});

// ---------- Setup ----------
setupLoad.addEventListener("click", () => {
  const pUrl = setupPlaylist.value.trim();
  const eUrl = setupEpg.value.trim();
  if (!/^https?:\/\//.test(pUrl)) {
    showSetup("Нужен http(s)-URL плейлиста");
    return;
  }
  if (isMixedContent(window.location.href, pUrl)) {
    showSetup(
      "Ссылка на плейлист http://, а страница открыта по https:// — браузер " +
        "блокирует смешанный контент. Замените схему на https://.",
    );
    return;
  }
  saveConfig({ playlistUrl: pUrl, epgUrl: eUrl || null }, localStorage);
  bootstrap();
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
    ? "Ссылка начинается с http://, а страница открыта по https:// — браузер " +
        "блокирует смешанный контент. Используйте https-ссылку на плейлист."
    : "Возможные причины: (1) на бакете не включён CORS — добавьте правило для " +
        "origin https://ozyab09.github.io (см. README), (2) ссылка недоступна " +
        "из браузера (приватный бакет, firewall). Проверьте консоль (F12) — " +
        "там будет точная причина (blocked by CORS policy / net::ERR_…).";
}

async function bootstrap(): Promise<void> {
  const cfg = resolveConfig(window.location.search, localStorage);
  if (!cfg) {
    showSetup();
    return;
  }
  setupPlaylist.value = cfg.playlistUrl;
  setupEpg.value = cfg.epgUrl ?? "";
  showPlayer();
  epgNow.hidden = false;
  epgNow.textContent = "Загрузка плейлиста…";

  try {
    snapshot = await loadPlaylist(cfg.playlistUrl);
  } catch (e) {
    showSetup(
      `Не удалось загрузить плейлист: ${e instanceof Error ? e.message : "ошибка"}. ` +
        describeFetchFailure(cfg.playlistUrl),
    );
    return;
  }

  renderCategories();
  renderChannels();
  epgNow.textContent = `Каналов: ${snapshot.channels.length} · Категорий: ${snapshot.categories.length}`;

  const epgUrl = cfg.epgUrl ?? snapshot.headerTvgUrl;
  if (epgUrl) {
    epgNow.textContent += " · Загрузка телепрограммы…";
    loadEpg(epgUrl)
      .then((parsed) => {
        epg = parsed;
        renderChannels();
        epgNow.textContent = `Каналов: ${snapshot!.channels.length} · Категорий: ${snapshot!.categories.length} · EPG ✓`;
      })
      .catch(() => {
        epgNow.textContent = `Каналов: ${snapshot!.channels.length} · Категорий: ${snapshot!.categories.length} · EPG недоступен`;
      });
  }
}

void STORAGE_KEY;

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
