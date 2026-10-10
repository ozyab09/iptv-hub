/**
 * Список каналов — DOM-слой (#367, паттерн #123): виртуальное окно,
 * карточка канала, строка результата поиска передач, плитка логотипа и
 * клавиатурный фокус. Какие строки показывать (раздел, категория, поиск,
 * избранное) решает main.ts и отдаёт готовый массив через results().
 *
 * Карточка — контейнер, а не кнопка (#351): запуск канала — растянутая на
 * всю строку кнопка .channel-hit, звезда и редактирование — соседние кнопки
 * поверх неё. Клик по любой точке строки по-прежнему запускает канал.
 */
import type { ChannelFailure } from "./channel-health";
import { formatRange } from "./epg";
import { isLongPress } from "./gestures";
import { t, type Language, type TranslationKey, type TranslationParams } from "./i18n";
import { iconMarkup } from "./icons";
import type { ProgrammeMatch } from "./programme-search";
import { clock, programmeProgress } from "./scrub";
import type { Channel, NowNext } from "./types";
import { channelRowClass, qualityBadgeClass, starClass } from "./ui-classes";
import { columnsForWidth, computeWindow, spacerHeight } from "./virtual-list";

/**
 * Высота строки канала. Должна совпадать с `.row.channel-card` в style.css:
 * виртуализация позиционирует строки арифметикой, и расхождение тут уводит
 * прокрутку. Тест сверяет оба значения.
 */
export const CHANNEL_ROW_HEIGHT = 72;

/** Список каналов — одна колонка строк, как требует дизайн-система. */
export const CHANNEL_COLUMNS = 1;

/** Каталог фильмов/сериалов: плитки 160 px и высота ряда. */
const CATALOGUE_MIN_WIDTH = 160;
const CATALOGUE_ROW_HEIGHT = 260;

export type ListRow = Channel | ProgrammeMatch;

export interface ChannelListUiDeps {
  list: HTMLElement;
  results: () => ListRow[];
  /** Каталог фильмов/сериалов вместо строк каналов. */
  isCatalogue: () => boolean;
  /** Раздел «Избранное»: строки перетаскиваются и переставляются Alt+↑/↓. */
  isFavoritesView: () => boolean;
  currentUrl: () => string | null;
  isFavorite: (channel: Channel) => boolean;
  failure: (url: string) => ChannelFailure | undefined;
  failureLabel: (failure: ChannelFailure) => string;
  /** Сейчас/далее по EPG или null без телепрограммы. */
  nowNext: (channel: Channel) => NowNext | null;
  /** Есть ли у канала передачи в загруженной EPG — значок в строке (#472). */
  hasEpg: (channel: Channel) => boolean;
  language: () => Language;
  toast: (message: string) => void;
  play: (channel: Channel) => void;
  playProgramme: (match: ProgrammeMatch) => void;
  toggleFavorite: (channel: Channel) => void;
  openEditor: (channel: Channel) => void;
  reorderFavorite: (fromUrl: string, toUrl: string) => void;
  playlistId: () => string | null;
  /** Перетаскивание началось: набор номера канала сбрасывается. */
  onDragStart: () => void;
  reminderButton: (match: ProgrammeMatch) => HTMLElement | null;
  catalogueCard: (channel: Channel) => HTMLElement;
  setIcon: (el: HTMLElement, name: string) => void;
  /** Hover-превью только там, где есть настоящий hover. */
  canHover: () => boolean;
}

export interface ChannelListUi {
  /** Перерисовать окно; resetScroll — вернуть список к началу. */
  render(resetScroll: boolean): void;
  /** Пересчитать окно (прокрутка, resize, раскрытие панели). */
  renderWindow(): void;
  focusAt(index: number): void;
  focusedIndex(): number;
}

/** Общая плитка: исходный логотип или монограмма, в том числе после ошибки. */
export function renderChannelLogo(c: Channel): HTMLSpanElement {
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

const FAVORITE_DRAG = "application/x-iptv-favorite";

function sourceBadge(c: Channel): HTMLElement | null {
  if (!c.source) return null;
  const badge = document.createElement("span");
  badge.className = "badge channel-source ellipsis";
  badge.textContent = c.source.name;
  badge.title = c.source.name;
  return badge;
}

export function createChannelListUi(deps: ChannelListUiDeps): ChannelListUi {
  const { list } = deps;
  const tr = (key: TranslationKey, params: TranslationParams = {}): string => t(key, deps.language(), params);
  /** Карточки держим живыми только в видимом окне; остальное — спейсер. */
  let spacer: HTMLDivElement | null = null;
  let inner: HTMLDivElement | null = null;

  function layout(): { columns: number; rowHeight: number; catalogue: boolean } {
    const catalogue = deps.isCatalogue();
    return {
      catalogue,
      columns: catalogue ? columnsForWidth(list.clientWidth, CATALOGUE_MIN_WIDTH) : CHANNEL_COLUMNS,
      rowHeight: catalogue ? CATALOGUE_ROW_HEIGHT : CHANNEL_ROW_HEIGHT,
    };
  }

  function ensureShell(): void {
    if (inner) return;
    spacer = document.createElement("div");
    spacer.className = "virtual-spacer";
    inner = document.createElement("div");
    inner.className = "virtual-inner";
    spacer.append(inner);
    list.append(spacer);
    list.addEventListener("scroll", () => renderWindow());
  }

  /** Результат поиска сохраняет высоту виртуальной строки канала. */
  function renderProgrammeMatch(match: ProgrammeMatch): HTMLElement {
    const { channel, programme } = match;
    const lang = deps.language();
    const row = document.createElement("div");
    row.tabIndex = 0;
    row.className = channelRowClass(deps.currentUrl() === channel.url);
    row.setAttribute("role", "listitem");
    const meta = document.createElement("span");
    meta.className = "meta";
    const name = document.createElement("span");
    name.className = "t-strong ellipsis";
    name.textContent = `${channel.name} · ${programme.title}`;
    const time = document.createElement("span");
    time.className = "row-now ellipsis muted num";
    const date = new Date(programme.start).toLocaleDateString(lang, { day: "2-digit", month: "2-digit" });
    time.textContent = `${date} · ${formatRange(programme, lang)}`;
    const line = document.createElement("span");
    line.className = "line";
    line.append(name);
    const source = sourceBadge(channel);
    if (source) line.append(source);
    meta.append(line, time);
    row.append(renderChannelLogo(channel), meta);
    row.title = `${name.textContent} · ${time.textContent}`;
    row.addEventListener("click", () => deps.playProgramme(match));
    row.addEventListener("keydown", (event) => {
      if (event.target === row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.stopPropagation();
        row.click();
      }
    });
    const reminder = deps.reminderButton(match);
    if (reminder) {
      row.classList.add("programme-result");
      row.append(reminder);
    }
    return row;
  }

  /** Перетаскивание и Alt+↑/↓ в «Избранном» (#288). */
  function enableReorder(card: HTMLElement, hit: HTMLButtonElement, c: Channel): void {
    card.draggable = true;
    hit.title = tr("favorites.reorderHint");
    hit.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
    hit.addEventListener("keydown", (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const channels = deps.results().filter((row): row is Channel => !("programme" in row));
      const index = channels.findIndex((channel) => channel.url === c.url);
      const target = channels[index + (event.key === "ArrowUp" ? -1 : 1)];
      if (target) deps.reorderFavorite(c.url, target.url);
    });
    card.addEventListener("dragstart", (event) => {
      if (!event.dataTransfer || event.target !== card) { event.preventDefault(); return; }
      event.dataTransfer.setData(FAVORITE_DRAG, JSON.stringify({ playlistId: deps.playlistId(), url: c.url }));
      event.dataTransfer.effectAllowed = "move";
      deps.onDragStart();
    });
    card.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes(FAVORITE_DRAG)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      card.classList.add("favorite-drop-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("favorite-drop-target"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("favorite-drop-target");
      try {
        const data = JSON.parse(event.dataTransfer?.getData(FAVORITE_DRAG) ?? "null");
        if (data?.playlistId === deps.playlistId() && typeof data.url === "string") deps.reorderFavorite(data.url, c.url);
      } catch { /* Чужой drag payload. */ }
    });
    card.addEventListener("dragend", () => {
      list.querySelectorAll(".favorite-drop-target").forEach((row) => row.classList.remove("favorite-drop-target"));
    });
  }

  function renderChannelCard(c: Channel): HTMLElement {
    const lang = deps.language();
    const card = document.createElement("div");
    card.className = channelRowClass(deps.currentUrl() === c.url);
    card.setAttribute("role", "listitem");
    card.dataset.channelUrl = c.url; // для клавиатурной навигации (FR-8)
    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "channel-hit";
    hit.setAttribute("aria-label", c.name);
    hit.title = c.url; // ссылка на поток при наведении
    card.append(hit);
    if (deps.isFavoritesView()) enableReorder(card, hit, c);
    const failure = deps.failure(c.url);
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
    const source = sourceBadge(c);
    if (source) line.append(source);

    if (failure) {
      const badge = document.createElement("span");
      badge.className = "channel-failure";
      badge.textContent = "!";
      badge.title = deps.failureLabel(failure);
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
    const nn = deps.nowNext(c);
    if (nn?.now) {
      const now = nn.now;
      const row = document.createElement("span");
      row.className = "row-now ellipsis";
      const time = document.createElement("span");
      time.className = "num muted";
      time.textContent = clock(Date.parse(now.start), lang);
      row.append(time, ` ${now.title}`);
      meta.append(row);

      const bar = document.createElement("span");
      bar.className = "prog";
      const fill = document.createElement("span");
      fill.style.width = `${(programmeProgress(Date.now(), Date.parse(now.start), Date.parse(now.stop)) * 100).toFixed(1)}%`;
      bar.append(fill);
      meta.append(bar);
    }
    if (nn?.next) nextText = `${clock(Date.parse(nn.next.start), lang)}  ${nn.next.title}`;
    card.append(meta);

    const nextEl = document.createElement("span");
    nextEl.className = "row-next ellipsis muted num";
    nextEl.textContent = nextText;
    card.append(nextEl);

    const star = document.createElement("button");
    const fav = deps.isFavorite(c);
    star.className = starClass(fav);
    star.title = fav ? tr("favorites.remove") : tr("favorites.add");
    star.setAttribute("aria-label", star.title);
    deps.setIcon(star, fav ? "star-on" : "star");
    star.addEventListener("click", (ev) => {
      ev.stopPropagation(); // не запускать воспроизведение
      deps.toggleFavorite(c);
    });
    const actions = document.createElement("span");
    actions.className = "channel-actions";
    if (deps.hasEpg(c)) {
      // Декоративный значок: у канала есть телепрограмма (#472).
      // Меньше кнопок — влезает перед звёздочкой, не меняет высоту строки.
      const mark = document.createElement("span");
      mark.className = "channel-epg";
      mark.innerHTML = iconMarkup("calendar", "i-sm");
      mark.title = tr("guide.epgBadge");
      mark.setAttribute("aria-label", tr("guide.epgBadge"));
      mark.setAttribute("role", "img");
      actions.append(mark);
    }
    const edit = document.createElement("button");
    edit.className = "icon-btn";
    edit.dataset.channelEdit = "";
    edit.title = tr("channel.edit");
    edit.setAttribute("aria-label", edit.title);
    deps.setIcon(edit, "edit");
    edit.addEventListener("click", (event) => { event.stopPropagation(); deps.openEditor(c); });
    actions.append(star, edit);
    card.append(actions);
    card.addEventListener("contextmenu", (event) => { event.preventDefault(); deps.openEditor(c); });

    // Мини-превью: текстовый тост «сейчас в эфире» (issue #118). Никаких
    // <video> — десяток одновременных декодеров убил бы мобильную батарею.
    let pressT = 0;
    let pressX = 0;
    let pressY = 0;
    const showPreview = (): void => {
      const now = deps.nowNext(c)?.now; // без телепрограммы превью не из чего собрать
      if (!now) return;
      deps.toast(tr("guide.preview", { channel: c.name, title: now.title, time: clock(Date.parse(now.start), deps.language()) }));
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
      if (deps.canHover()) showPreview();
    });

    card.addEventListener("click", () => deps.play(c));
    return card;
  }

  function renderWindow(): void {
    if (!inner || !spacer) return;
    const results = deps.results();
    const vh = list.clientHeight || 600;
    const { catalogue, columns, rowHeight } = layout();
    inner.dataset.catalogue = String(catalogue);
    inner.style.gridTemplateColumns = catalogue ? `repeat(${columns}, minmax(0, 1fr))` : "";
    const win = computeWindow(list.scrollTop, vh, results.length, rowHeight, undefined, columns);
    spacer.style.height = `${spacerHeight(results.length, rowHeight, columns)}px`;
    inner.style.transform = `translateY(${win.offset}px)`;
    inner.textContent = "";
    const first = win.start * columns;
    const last = Math.min(results.length, first + win.count * columns);
    for (let i = first; i < last; i++) {
      const c = results[i];
      if (!c) continue;
      const row = "programme" in c ? renderProgrammeMatch(c) : catalogue ? deps.catalogueCard(c) : renderChannelCard(c);
      row.dataset.resultIndex = String(i);
      inner.append(row);
    }
  }

  return {
    render(resetScroll) {
      ensureShell();
      // при смене фильтра сбрасываем прокрутку, чтобы окно пересчиталось с нуля
      if (resetScroll) list.scrollTop = 0;
      renderWindow();
    },
    renderWindow,
    focusAt(index) {
      if (!deps.results()[index]) return;
      const { columns, rowHeight } = layout();
      list.scrollTop = Math.floor(index / columns) * rowHeight;
      renderWindow();
      const row = list.querySelector<HTMLElement>(`[data-result-index="${index}"]`);
      (row?.querySelector<HTMLElement>(".channel-hit") ?? row)?.focus();
    },
    focusedIndex() {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return -1;
      // Фокус живёт на .channel-hit внутри строки (#351) или на самой строке передачи.
      const index = active.closest<HTMLElement>("[data-result-index]")?.dataset.resultIndex;
      return index === undefined ? -1 : Number(index);
    },
  };
}
