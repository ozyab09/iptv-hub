/**
 * UI менеджера плейлистов (issue #123, срез 3): setup-список с
 * активацией/редактированием/удалением и переключатель в топбаре.
 *
 * Модуль получает готовые DOM-узлы, зависимости (localStorage, фабрика
 * кнопок) и действия («показать ошибку», «перейти к каналам») через create —
 * сам он ничего не ищет в документе и не знает устройство main.ts.
 * Данные и хранение остаются в чистом playlists.ts; здесь только DOM.
 */
import {
  activePlaylist,
  favoritesKey,
  removePlaylist,
  savePlaylists,
  updatePlaylist,
  type PlaylistsState,
} from "./playlists";
import { removeLocalPlaylist, type LocalFs } from "./local-playlist";
import { channelsWord } from "./views";
import { menuItemClass } from "./ui-classes";
import { t, type Language, type TranslationKey } from "./i18n";
import { readXtreamUrl, validateXtream, xtreamApiUrl, xtreamEpgUrl } from "./xtream";
import { channelHealthKey } from "./channel-health";
import { favoritesOrderKey } from "./favorites-order";
import { remindersKey } from "./reminder";
import { epgSourcesInput } from "./epg-sources";

type KV = import("./playlists").KV;
/** Откуда взять OPFS для удаления содержимого локального плейлиста. */
export type LocalFsProvider = () => Promise<LocalFs> | null;

export interface PlaylistUiNodes {
  /** Список плейлистов на setup-экране. */
  plList: HTMLElement;
  /** Враппер переключателя в топбаре. */
  plSwitch: HTMLElement;
  /** Кнопка «текущий плейлист» (открывает меню переключения). */
  plSwitchBtn: HTMLButtonElement;
  /** Выпадающее меню переключателя. */
  plSwitchMenu: HTMLElement;
  /** Название активного плейлиста в топбаре. */
  plSwitchName: HTMLElement;
  /** Счётчик каналов рядом с названием. */
  plSwitchCount: HTMLElement;
}

export interface PlaylistUiDeps {
  nodes: PlaylistUiNodes;
  /** Локальное хранилище или null (приватный режим). */
  storage: KV;
  /** Число каналов активного плейлиста — «2 345 каналов» у переключателя. */
  channelCount(): number | null;
  /** Фабрика кнопок (в браузере — document.createElement). */
  createButton(): HTMLButtonElement;
  /** Показать ошибку валидации на setup-экране; пустая строка — скрыть. */
  showSetupError(message: string): void;
  /** Перейти из setup-экрана к списку каналов (повторный клик по активному). */
  showPlayer(): void;
  /** Активировать плейлист (перезагрузить избранное/список/EPG). */
  activatePlaylist(id: string): void;
  /** Вид настроек (первый запуск/настройки) зависит от числа плейлистов. */
  renderSettingsMode(): void;
  /** Синхронизировать владельца состояния после редактирования/удаления. */
  stateChanged(state: PlaylistsState): void;
  /** Текущий язык интерфейса — для всех подписей и window.confirm. */
  language(): Language;
  /** Вставить иконку в кнопку (в браузере — setIcon из main.ts). */
  icon(el: HTMLElement, name: string): void;
}

export function createPlaylistUi(deps: PlaylistUiDeps) {
  const { nodes, storage } = deps;
  const lang = (): Language => deps.language();
  /** Истина о списке живёт в main.ts: main синхронизирует его в sync(). */
  let state: PlaylistsState = { items: [], activeId: null };
  /** OPFS-хранилище локальных плейлистов; нет — удаление молча пропустит. */
  let localFs: LocalFsProvider = () => null;

  /** Прочитать состояние списка (после чужих мутаций в main.ts). */
  function getState(): PlaylistsState {
    return state;
  }

  /** Взять состояние из main.ts перед любым рендером. */
  function sync(next: PlaylistsState): void {
    state = next;
  }

  /** Зарегистрировать способ добраться до OPFS (ленивый getLocalFs). */
  function setLocalFsProvider(provider: LocalFsProvider): void {
    localFs = provider;
  }

  /** «storage.yandexcloud.net · с телепрограммой» — откуда плейлист, коротко. */
  function urlLabel(playlistUrl: string, epgUrl: string | null): string {
    let host = playlistUrl;
    try {
      host = new URL(playlistUrl).host;
    } catch {
      // оставим как есть
    }
    return epgUrl ? t("playlist.withEpg", lang(), { host }) : host;
  }

  // ---------- Менеджер (setup-список) ----------
  /** Перестроить список плейлистов на setup-экране. */
  function renderManager(next?: PlaylistsState): void {
    if (next) state = next;
    nodes.plList.textContent = "";
    for (const p of state.items) {
      const active = p.id === state.activeId;
      const row = document.createElement("div");
      row.className = active ? "item pl-row active" : "item pl-row";

      // Вся строка — выбор плейлиста: радиокнопка, название, откуда он
      const pick = deps.createButton();
      pick.className = "pl-pick";
      pick.setAttribute("role", "radio");
      pick.setAttribute("aria-checked", String(active));
      pick.title = t(p.id === state.activeId ? "playlist.active" : "playlist.pick", lang());
      const radio = document.createElement("span");
      radio.className = "radio";
      const text = document.createElement("span");
      text.className = "pl-text";
      const name = document.createElement("span");
      name.className = "pl-name";
      const url = document.createElement("span");
      url.className = "pl-url muted";
      name.textContent = p.name;
      url.textContent = urlLabel(p.playlistUrl, p.epgUrl);
      text.append(name, url);
      pick.append(radio, text);
      pick.addEventListener("click", () => {
        if (!active) deps.activatePlaylist(p.id);
        else deps.showPlayer();
      });

      // ---------- Редактирование ----------
      const edit = deps.createButton();
      edit.className = "icon-btn pl-act";
      edit.title = t("playlist.editHint", lang());
      edit.setAttribute("aria-label", t("playlist.edit", lang(), { name: p.name }));
      deps.icon(edit, "edit");
      edit.addEventListener("click", () => {
        // Инлайн-редактирование: строка превращается в форму
        row.textContent = "";
        row.classList.add("editing");
        const form = document.createElement("form");
        form.className = "pl-edit";
        form.noValidate = true;
        const mk = (key: TranslationKey, value: string, type = "text"): HTMLInputElement => {
          const field = document.createElement("label");
          field.className = "field";
          const l = document.createElement("span");
          l.className = "field-label";
          l.dataset.i18n = key;
          l.textContent = t(key, lang());
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
        const nameIn = mk("playlist.name", p.name);
        const source = readXtreamUrl(p.playlistUrl);
        const urlIn = source ? null : mk("playlist.url", p.playlistUrl, "url");
        const hostIn = source ? mk("playlist.xtreamHost", source.host, "url") : null;
        const userIn = source ? mk("playlist.xtreamUser", source.username) : null;
        const passwordIn = source ? mk("playlist.xtreamPassword", source.password, "password") : null;
        let vodInput: HTMLInputElement | null = null;
        if (source) {
          const label = document.createElement("label");
          label.className = "set-note";
          vodInput = document.createElement("input");
          vodInput.type = "checkbox";
          vodInput.checked = p.xtreamVod === true;
          const text = document.createElement("span");
          text.dataset.i18n = "playlist.xtreamVod";
          text.textContent = t("playlist.xtreamVod", lang());
          label.append(vodInput, text);
          form.append(label);
        }
        const epgIn = mk("playlist.epgOptional", source && p.epgUrl === xtreamEpgUrl(source) ? "" : p.epgUrl ?? "", "url");
        const additionalEpgIn = mk("playlist.additionalEpg", (p.additionalEpgUrls ?? []).join(" "));
        const btns = document.createElement("div");
        btns.className = "pl-edit-actions";
        const save = deps.createButton();
        save.className = "btn btn-primary btn-sm";
        save.type = "submit";
        save.dataset.i18n = "common.save";
        save.textContent = t("common.save", lang());
        const cancel = deps.createButton();
        cancel.className = "btn btn-ghost btn-sm";
        cancel.type = "button";
        cancel.dataset.i18n = "common.cancel";
        cancel.textContent = t("common.cancel", lang());
        btns.append(save, cancel);
        form.append(btns);
        row.append(form);
        nameIn.focus();

        cancel.addEventListener("click", () => renderManager());
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const newName = nameIn.value.trim();
          let newUrl = urlIn?.value.trim() ?? "";
          let newEpg = epgIn.value.trim();
          const additionalEpgUrls = epgSourcesInput(additionalEpgIn.value);
          if (!additionalEpgUrls) { deps.showSetupError(t("error.epgSources", lang())); return; }
          if (source) {
            const updated = validateXtream({ host: hostIn!.value, username: userIn!.value, password: passwordIn!.value });
            if (!updated || (newEpg && !newEpg.startsWith("https://"))) {
              deps.showSetupError(t("error.xtreamInput", lang()));
              return;
            }
            newUrl = xtreamApiUrl(updated, "get_live_streams");
            newEpg = newEpg || xtreamEpgUrl(updated);
          }
          if (!/^https?:\/\//.test(newUrl)) {
            deps.showSetupError(t("error.url", lang()));
            return;
          }
          state = updatePlaylist(state, p.id, {
            name: newName || p.name,
            playlistUrl: newUrl,
            epgUrl: newEpg || null,
            ...(additionalEpgUrls.length || p.additionalEpgUrls ? { additionalEpgUrls } : {}),
            ...(source ? { xtreamVod: vodInput?.checked === true } : {}),
          });
          savePlaylists(storage, state);
          deps.stateChanged(state);
          deps.showSetupError("");
          renderManager();
          renderSwitcher();
          if (active && (source || newEpg !== (p.epgUrl ?? "") || JSON.stringify(additionalEpgUrls) !== JSON.stringify(p.additionalEpgUrls ?? []))) deps.activatePlaylist(p.id);
        });
      });

      // ---------- Удаление ----------
      const del = deps.createButton();
      del.className = "icon-btn pl-act pl-del";
      del.title = t("playlist.deleteHint", lang());
      del.setAttribute("aria-label", t("playlist.delete", lang(), { name: p.name }));
      deps.icon(del, "trash");
      del.addEventListener("click", () => {
        if (!window.confirm(t("playlist.confirmDelete", lang(), { name: p.name }))) return;
        if (storage) {
          storage.removeItem(favoritesKey(p.id));
          storage.removeItem(favoritesOrderKey(p.id));
          storage.removeItem(remindersKey(p.id));
          storage.removeItem(channelHealthKey(p.id));
        }
        // Локальный плейлист: чистим и содержимое в OPFS (FR-10)
        if (p.playlistUrl.startsWith("local:")) {
          const fs = localFs();
          if (fs) void fs.then((f) => removeLocalPlaylist(f, p.id));
        }
        state = removePlaylist(state, p.id);
        savePlaylists(storage, state);
        deps.stateChanged(state);
        renderManager();
        renderSwitcher();
        deps.renderSettingsMode();
      });

      row.append(pick, edit, del);
      nodes.plList.append(row);
    }
  }

  // ---------- Переключатель (топбар) ----------
  /** Перестроить переключатель: название, счётчик, пункты меню. */
  function renderSwitcher(next?: PlaylistsState): void {
    if (next) state = next;
    const active = activePlaylist(state);
    nodes.plSwitch.hidden = !active;
    if (!active) return;
    nodes.plSwitchName.textContent = active.name;
    // Видимый текст — название, а имя кнопки для скринридера — её действие
    nodes.plSwitchBtn.setAttribute("aria-label", t("playlist.switchNamed", lang(), { name: active.name }));
    const count = deps.channelCount();
    nodes.plSwitchCount.textContent = count !== null ? channelsWord(count) : "";
    nodes.plSwitchMenu.textContent = "";
    for (const p of state.items) {
      const b = deps.createButton();
      b.className = menuItemClass(p.id === state.activeId);
      b.textContent = p.name;
      b.addEventListener("click", () => {
        nodes.plSwitchMenu.hidden = true;
        nodes.plSwitchBtn.setAttribute("aria-expanded", "false");
        if (p.id !== state.activeId) deps.activatePlaylist(p.id);
      });
      nodes.plSwitchMenu.append(b);
    }
  }

  /** Кнопка топбара нажата: раскрыть/свернуть меню переключения. */
  function toggleSwitcherMenu(): void {
    const willOpen = nodes.plSwitchMenu.hidden;
    nodes.plSwitchMenu.hidden = !willOpen;
    nodes.plSwitchBtn.setAttribute("aria-expanded", String(willOpen));
  }

  /**
   * Клик мимо (main.ts проверяет contains() и перенаправляет сюда).
   * Возвращает true, если открытое меню было закрыто.
   */
  function closeSwitcherIfOutside(target: Node | null): boolean {
    if (nodes.plSwitchMenu.hidden) return false;
    if (target !== null && nodes.plSwitch.contains(target)) return false;
    nodes.plSwitchMenu.hidden = true;
    nodes.plSwitchBtn.setAttribute("aria-expanded", "false");
    return true;
  }

  /**
   * Подписи редактируемой строки переживают смену языка без пересоздания
   * списка: незавершённое редактирование не должно теряться (#i18n).
   */
  function applyLanguage(): void {
    for (const [index, p] of state.items.entries()) {
      const row = nodes.plList.children[index];
      if (!row || row.classList.contains("editing")) continue;
      const pick = row.querySelector<HTMLButtonElement>(".pl-pick");
      if (!pick) continue;
      pick.title = t(p.id === state.activeId ? "playlist.active" : "playlist.pick", lang());
      const url = row.querySelector<HTMLElement>(".pl-url");
      if (url) url.textContent = urlLabel(p.playlistUrl, p.epgUrl);
      const edit = row.querySelector<HTMLElement>(".pl-act");
      if (edit) {
        edit.title = t("playlist.editHint", lang());
        edit.setAttribute("aria-label", t("playlist.edit", lang(), { name: p.name }));
      }
      const del = row.querySelector<HTMLElement>(".pl-del");
      if (del) {
        del.title = t("playlist.deleteHint", lang());
        del.setAttribute("aria-label", t("playlist.delete", lang(), { name: p.name }));
      }
    }
  }

  return {
    getState,
    sync,
    setLocalFsProvider,
    renderManager,
    renderSwitcher,
    toggleSwitcherMenu,
    closeSwitcherIfOutside,
    applyLanguage,
  };
}
