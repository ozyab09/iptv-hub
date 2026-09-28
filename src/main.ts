import "./style.css";
import { resolveConfig, saveConfig, STORAGE_KEY } from "./config";
import { parseM3U } from "./m3u";
import { formatRange, getNowNext, loadEpg } from "./epg";
import { Player } from "./player";
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

// ---------- Состояние ----------
let snapshot: PlaylistSnapshot | null = null;
let epg: Map<string, import("./types").EpgProgramme[]> | null = null;
let activeCategory: string | null = null;
const player = new Player(videoEl, showToast);

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
  channelList.textContent = "";
  emptyState.hidden = list.length > 0;
  for (const c of list) {
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
  card.append(name);

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
  nowTitle.textContent = c.name;
  nowCategory.textContent = c.group;
  playerBar.hidden = false;
  if (!player.play(c)) {
    showToast("Формат потока не поддерживается");
  }
  renderChannels(); // подсветка активного
}

btnClosePlayer.addEventListener("click", () => {
  player.stop();
  playerBar.hidden = true;
  renderChannels();
});

// Театральный режим
btnExpand.addEventListener("click", () => {
  playerBar.classList.toggle("theater");
});

// ---------- Поиск ----------
searchInput.addEventListener("input", () => renderChannels());

// ---------- Setup ----------
setupLoad.addEventListener("click", () => {
  const pUrl = setupPlaylist.value.trim();
  const eUrl = setupEpg.value.trim();
  if (!/^https?:\/\//.test(pUrl)) {
    showSetup("Нужен http(s)-URL плейлиста");
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
        `Проверьте ссылку и CORS на бакете.`,
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
