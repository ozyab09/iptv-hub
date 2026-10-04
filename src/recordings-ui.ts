/**
 * Библиотека записанных эфиров (#159) — DOM-слой поверх recordings.ts и
 * recordings-store.ts (#365, паттерн #123).
 *
 * Готовая запись сохраняется в OPFS + метаданные в localStorage; список
 * показывается в разделе «Записи», клик — воспроизведение из приложения,
 * скачивание и удаление — кнопками карточки. Вход в просмотр записи и выбор
 * субтитров трогают состояние плеера в main.ts, поэтому приходят колбэками.
 */
import { t, type Language, type TranslationKey, type TranslationParams } from "./i18n";
import { iconMarkup } from "./icons";
import { recordingFileName } from "./recorder";
import { clearRecordingPending } from "./recording-recovery";
import {
  addRecording,
  formatBytes,
  formatDuration,
  loadRecordings,
  removeRecording,
  type RecordingMeta,
} from "./recordings";
import { recordingFileName as storedRecordingName, type RecordingsFs } from "./recordings-store";
import { parseSubtitlePreference, subtitlePreferenceKey } from "./external-subtitles";

/** Подпись записи, собранная при её старте. */
export interface RecordingLabel {
  channelName: string;
  channelUrl: string;
  programmeTitle: string | null;
  startedAt: number;
  durationSec: number;
}

export interface RecordingsUiNodes {
  screen: HTMLElement;
  empty: HTMLElement;
  list: HTMLElement;
}

export interface RecordingsUiDeps {
  nodes: RecordingsUiNodes;
  fs: () => RecordingsFs | null;
  storage: () => Storage | null;
  /** Открыт ли раздел «Записи». */
  isActive: () => boolean;
  language: () => Language;
  toast: (message: string) => void;
  toastAction: (message: string, label: string, action: () => void, ms: number) => void;
  /** Проиграть файл записи в основном плеере. */
  play: (file: File, recording: RecordingMeta) => void;
  chooseSubtitles: (recording: RecordingMeta) => void;
  /** Запись удалена: main снимает её субтитры и состояние просмотра. */
  onDeleted: (id: string) => void;
  /** Перед перерисовкой списка: расписание и строка скачивания живут на том же экране. */
  beforeRender?: () => void;
  makeId?: () => string;
}

export interface RecordingsUi {
  render(): void;
  /** Положить готовый файл в библиотеку и отдать в загрузки. */
  saveToLibrary(blob: Blob, ext: string, label: RecordingLabel): Promise<void>;
  /** Отдать файл пользователю (общее для обоих способов записи). */
  offerDownload(blob: Blob, name: string): void;
}

export function createRecordingsUi(deps: RecordingsUiDeps): RecordingsUi {
  const tr = (key: TranslationKey, params: TranslationParams = {}): string => t(key, deps.language(), params);
  const makeId = deps.makeId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  function readFile(r: RecordingMeta): Promise<File | null> {
    const fs = deps.fs();
    return fs ? fs.read(storedRecordingName(r.id, r.ext)) : Promise.resolve(null);
  }

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
    deps.toastAction(tr("record.autoDownload"), tr("record.downloadName", { name }), download, 15_000);
  }

  async function saveToLibrary(blob: Blob, ext: string, label: RecordingLabel): Promise<void> {
    const fs = deps.fs();
    if (!fs) {
      // OPFS нет — прежнее поведение: сразу скачивание.
      offerDownload(blob, recordingFileName(label.channelName));
      return;
    }
    const id = makeId();
    const meta: RecordingMeta = { id, ...label, sizeBytes: blob.size, ext };
    try {
      await fs.write(storedRecordingName(id, ext), blob);
      addRecording(deps.storage(), meta);
      clearRecordingPending(deps.storage());
      render();
      // Файл и в библиотеке, и в загрузках: сырой .ts браузерный <video>
      // играть не умеет (только через MSE), поэтому прежнее скачивание —
      // не опция, а необходимость.
      offerDownload(blob, recordingFileName(meta.channelName, new Date(meta.startedAt), ext));
    } catch (e) {
      console.debug("[iptv-hub] записи: не удалось сохранить в библиотеку, скачиваю", e);
      offerDownload(blob, recordingFileName(meta.channelName)); // откат — скачивание
    }
  }

  function actionButton(title: string, label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recording-act";
    button.title = title;
    button.setAttribute("aria-label", label);
    return button;
  }

  function renderCard(r: RecordingMeta): HTMLElement {
    const lang = deps.language();
    const card = document.createElement("div");
    card.className = "recording-card";
    const play = document.createElement("button");
    play.type = "button";
    play.className = "recording-play";
    const when = new Date(r.startedAt);
    card.title = `${r.channelName} · ${when.toLocaleString(lang)} · ${formatDuration(r.durationSec)}`;

    const name = document.createElement("span");
    name.className = "recording-name ellipsis";
    name.textContent = r.programmeTitle ?? r.channelName;
    play.append(name);

    const sub = document.createElement("span");
    sub.className = "recording-sub muted num";
    sub.textContent = `${r.channelName} · ${when.toLocaleDateString(lang)} ${when.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })} · ${formatDuration(r.durationSec)} · ${formatBytes(r.sizeBytes)}`;
    play.append(sub);
    card.append(play);

    // Клик — воспроизведение из OPFS.
    play.addEventListener("click", () => {
      if (!deps.fs()) return;
      void readFile(r).then((file) => {
        if (!file) {
          deps.toast(tr("error.recordMissing"));
          return;
        }
        deps.play(file, r);
      });
    });

    const actions = document.createElement("div");
    actions.className = "recording-actions";

    const download = actionButton(tr("record.download"), tr("record.downloadLabel"));
    download.innerHTML = iconMarkup("download");
    download.addEventListener("click", () => {
      void readFile(r).then((file) => {
        if (file) offerDownload(file, recordingFileName(r.channelName, new Date(r.startedAt), r.ext));
      });
    });

    const del = actionButton(tr("record.delete"), tr("record.delete"));
    del.innerHTML = iconMarkup("trash");
    del.addEventListener("click", () => {
      const fs = deps.fs();
      if (!fs) return;
      void fs.remove(storedRecordingName(r.id, r.ext)).then(() => {
        const storage = deps.storage();
        removeRecording(storage, r.id);
        try { storage?.removeItem(subtitlePreferenceKey(r.id)); } catch { /* приватный режим */ }
        deps.onDeleted(r.id);
        render();
      });
    });

    const preference = parseSubtitlePreference(deps.storage()?.getItem(subtitlePreferenceKey(r.id)) ?? null);
    const subtitles = actionButton(
      preference ? tr("player.subtitlesLastFile", { name: preference.name }) : tr("player.subtitlesFile"),
      tr("player.subtitlesFile"),
    );
    subtitles.dataset.recordingSubtitles = "";
    subtitles.textContent = "CC";
    subtitles.addEventListener("click", () => deps.chooseSubtitles(r));

    actions.append(download, del, subtitles);
    card.append(actions);
    return card;
  }

  function render(): void {
    deps.beforeRender?.();
    const list = loadRecordings(deps.storage());
    // Раздел «Записи» — самостоятельный экран из сайдбара (см. VIEWS).
    const active = deps.isActive();
    deps.nodes.screen.hidden = !active;
    deps.nodes.empty.hidden = list.length > 0;
    deps.nodes.list.textContent = "";
    if (!active) return;
    for (const r of list) deps.nodes.list.append(renderCard(r));
  }

  return { render, saveToLibrary, offerDownload };
}
