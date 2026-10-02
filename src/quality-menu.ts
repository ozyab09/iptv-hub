/**
 * UI меню качества / аудиодорожек / субтитров — DOM-слой поверх player.ts
 * и quality.ts (issue #123, срез 2).
 *
 * Модуль получает готовые DOM-узлы и адаптер плеера через create — сам он
 * ничего не ищет в документе. Перестроение списков — по требованию
 * (refreshQualityUi при смене канала и событиях hls.js), чистые лейблы
 * берутся из quality.ts.
 */
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
import { menuItemClass } from "./ui-classes";

/** Минимальная поверхность hls-инстанса, нужная меню (для тестов — фейк). */
export interface HlsLike {
  levels: { height: number; bitrate: number }[];
  currentLevel: number;
  autoLevelEnabled: boolean;
  audioTracks: { name?: string; lang?: string }[];
  audioTrack: number;
  subtitleTracks: { name?: string; lang?: string }[];
  subtitleTrack: number;
}

/** Действия над плеером: DOM-модуль не знает устройство Player. */
export interface QualityPlayerAdapter {
  getHls(): HlsLike | null;
  setLevel(index: number): void;
  setAudioTrack(index: number): void;
  setSubtitleTrack(index: number): void;
}

export interface QualityMenuNodes {
  qualityWrap: HTMLElement;
  qualityBtn: HTMLButtonElement;
  qualityMenu: HTMLElement;
  audioWrap: HTMLElement;
  audioBtn: HTMLButtonElement;
  audioMenu: HTMLElement;
  subtitleWrap: HTMLElement;
  subtitleBtn: HTMLButtonElement;
  subtitleMenu: HTMLElement;
  playerStatus: HTMLElement;
}

export interface QualityMenuDeps {
  player: QualityPlayerAdapter;
  nodes: QualityMenuNodes;
  isRecordingPlayback(): boolean;
  /** Разрешение и состояние видео — для статус-бара нативного playback. */
  videoSize(): { width: number; height: number };
  /** Фабрика элементов меню (в браузере — document.createElement). */
  createButton(): HTMLButtonElement;
}

export function createQualityMenu(deps: QualityMenuDeps) {
  const { nodes, player } = deps;

  function closeQualityMenu(): void {
    nodes.qualityMenu.hidden = true;
    nodes.qualityBtn.setAttribute("aria-expanded", "false");
  }

  function refreshQualityAvailability(): void {
    nodes.qualityBtn.disabled = deps.isRecordingPlayback() || !player.getHls();
    nodes.qualityBtn.setAttribute("aria-disabled", String(nodes.qualityBtn.disabled));
    if (nodes.qualityBtn.disabled) closeQualityMenu();
  }

  /** Перестроить селект качества + дорожки после смены канала. */
  function refreshQualityUi(): void {
    refreshQualityAvailability();
    const hls = player.getHls();
    nodes.qualityMenu.textContent = "";
    nodes.audioMenu.textContent = "";
    nodes.subtitleMenu.textContent = "";

    if (!hls) {
      // нативный playback (Safari/iOS, mp4): выбор качества/дорожек недоступен
      nodes.qualityBtn.textContent = "Auto";
      nodes.qualityMenu.hidden = true;
      nodes.audioWrap.hidden = true;
      nodes.subtitleWrap.hidden = true;
      const { width, height } = deps.videoSize();
      nodes.playerStatus.textContent = width
        ? formatStatus({ resolution: formatResolution(width, height), bitrate: "—" })
        : "—";
      return;
    }

    const levels = sortLevelsDesc(hls.levels.map((lv, i) => ({ ...lv, index: i })));
    const currentLv = hls.levels[hls.currentLevel] ?? null;
    nodes.qualityBtn.textContent = qualityButtonLabel(hls.autoLevelEnabled, currentLv);
    const mkItem = (label: string, levelIndex: number, active: boolean) => {
      const b = deps.createButton();
      b.className = menuItemClass(active);
      b.setAttribute("role", "option");
      b.textContent = label;
      b.addEventListener("click", () => {
        if (deps.isRecordingPlayback() || nodes.qualityBtn.disabled) return;
        player.setLevel(levelIndex);
        closeQualityMenu();
      });
      return b;
    };
    nodes.qualityMenu.append(
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
    nodes.audioWrap.hidden = audioTracks.length < 2;
    if (audioTracks.length >= 2) {
      audioTracks.forEach((t, i) => {
        const b = deps.createButton();
        b.className = menuItemClass(i === hls.audioTrack);
        b.textContent = trackLabel(t, i);
        b.addEventListener("click", () => {
          player.setAudioTrack(i);
          nodes.audioMenu.hidden = true;
        });
        nodes.audioMenu.append(b);
      });
      nodes.audioBtn.title = `Аудиодорожка: ${trackLabel(audioTracks[hls.audioTrack] ?? {}, hls.audioTrack)}`;
    }

    const subTracks = hls.subtitleTracks ?? [];
    nodes.subtitleWrap.hidden = subTracks.length === 0;
    if (subTracks.length > 0) {
      const off = deps.createButton();
      off.className = menuItemClass(hls.subtitleTrack === -1);
      off.textContent = "Выключены";
      off.addEventListener("click", () => {
        player.setSubtitleTrack(-1);
        nodes.subtitleMenu.hidden = true;
      });
      nodes.subtitleMenu.append(off);
      subTracks.forEach((t, i) => {
        const b = deps.createButton();
        b.className = menuItemClass(i === hls.subtitleTrack);
        b.textContent = trackLabel(t, i);
        b.addEventListener("click", () => {
          player.setSubtitleTrack(i);
          nodes.subtitleMenu.hidden = true;
        });
        nodes.subtitleMenu.append(b);
      });
    }
  }

  /** Обновить статус-бар: разрешение + текущий битрейт (при смене уровня). */
  function refreshPlayerStatus(): void {
    const hls = player.getHls();
    if (!hls) return;
    const lv = hls.levels[hls.currentLevel];
    const { width, height } = deps.videoSize();
    nodes.playerStatus.textContent = formatStatus({
      resolution: formatResolution(width, height),
      bitrate: lv ? formatBitrate(lv.bitrate) : "—",
    });
  }

  return {
    refreshQualityAvailability,
    refreshQualityUi,
    refreshPlayerStatus,
    closeQualityMenu,
  };
}
