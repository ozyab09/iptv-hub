import { createMultiView } from "./multi-view";
import { Player, seekBy } from "./player";
import { iconMarkup } from "./icons";
import { t, translateMessage, type Language } from "./i18n";
import type { PlayerSettings } from "./player-settings";
import type { Channel } from "./types";

interface Options {
  panel: HTMLElement;
  language: () => Language;
  settings: () => PlayerSettings;
  toast: (message: string) => void;
  select: (channel: Channel | null) => void;
  playback: (playing: boolean) => void;
  exit: () => void;
}

/** DOM сетки изолирован от контролов одиночного плеера. */
export function createMultiViewUi(opts: Options) {
  const grid = opts.panel.querySelector<HTMLElement>(".multi-grid")!;
  const volume = opts.panel.querySelector<HTMLInputElement>("#multi-volume")!;
  const mute = opts.panel.querySelector<HTMLButtonElement>("#multi-mute")!;
  const pause = opts.panel.querySelector<HTMLButtonElement>("#multi-pause")!;
  let videos: HTMLVideoElement[] = [];
  let labels: HTMLButtonElement[] = [];
  let lastVolume = 1;
  const tr = (key: Parameters<typeof t>[0]): string => t(key, opts.language());
  const notifyPlayback = (): void => {
    opts.playback(videos.some((video) => !video.paused && !video.ended));
    render();
  };

  const model = createMultiView((slot) => {
    const tile = document.createElement("div");
    tile.className = "multi-tile";
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.addEventListener("play", notifyPlayback);
    video.addEventListener("pause", notifyPlayback);
    video.addEventListener("ended", notifyPlayback);
    videos.push(video);
    const label = document.createElement("button");
    label.className = "multi-select";
    label.addEventListener("click", () => {
      model.select(slot);
      render();
      opts.select(model.channel);
    });
    labels.push(label);
    // Клик по кадру выбирает окно; кнопка обеспечивает выбор с клавиатуры.
    video.addEventListener("click", () => label.click());
    const status = document.createElement("span");
    status.className = "multi-status";
    status.hidden = true;
    const retry = document.createElement("button");
    retry.className = "multi-retry btn btn-sm";
    retry.textContent = tr("multi.retry");
    retry.hidden = true;
    retry.addEventListener("click", () => { retry.hidden = true; status.hidden = true; player.retry(); });
    const player = new Player(video, (message) => {
      status.textContent = translateMessage(message, opts.language());
      status.hidden = false;
    }, () => { status.hidden = true; retry.hidden = true; }, () => { retry.hidden = false; }, opts.settings);
    tile.append(video, label, status, retry);
    grid.append(tile);
    return {
      play(channel: Channel): string | null {
        status.hidden = true;
        retry.hidden = true;
        return player.play(channel);
      },
      stop: () => player.stop(),
      setVolume: (value: number) => player.setVolume(value),
      togglePause: () => player.togglePause(),
    };
  });

  function render(): void {
    labels.forEach((label, index) => {
      const selected = index === model.activeSlot;
      label.textContent = `${index + 1} · ${model.channels[index]?.name ?? tr("multi.empty")}${selected ? ` · ${tr("multi.audio")}` : ""}`;
      label.setAttribute("aria-pressed", String(selected));
      label.parentElement!.classList.toggle("on", selected);
    });
    mute.innerHTML = iconMarkup(Number(volume.value) === 0 ? "mute" : "volume");
    pause.innerHTML = iconMarkup(videos[model.activeSlot]?.paused ? "play" : "pause");
    pause.disabled = model.channel === null;
  }

  function changeVolume(value: number): void {
    volume.value = String(Math.min(100, Math.max(0, value)));
    model.setVolume(Number(volume.value) / 100);
    render();
  }
  function toggleMute(): void {
    const value = Number(volume.value);
    if (value > 0) lastVolume = value / 100;
    changeVolume(value > 0 ? 0 : lastVolume * 100);
  }
  volume.addEventListener("input", () => changeVolume(Number(volume.value)));
  mute.addEventListener("click", toggleMute);
  pause.addEventListener("click", () => { model.togglePause(); render(); });

  return {
    start(channel: Channel, initialVolume: number): void {
      volume.value = String(initialVolume * 100);
      const refused = model.start(channel, initialVolume);
      opts.panel.hidden = false;
      render();
      if (refused) opts.toast(refused);
    },
    play(channel: Channel): void {
      const refused = model.play(channel);
      render();
      opts.select(channel);
      if (refused) opts.toast(refused);
    },
    close(): Channel | null {
      const channel = model.close();
      videos = [];
      labels = [];
      grid.textContent = "";
      opts.panel.hidden = true;
      opts.playback(false);
      return channel;
    },
    render,
    updateNames(nameFor: (channel: Channel) => string): void {
      for (const channel of model.channels) if (channel) channel.name = nameFor(channel);
      render();
    },
    handleKey(event: KeyboardEvent): boolean {
      // Space/Enter на кнопке окна должны активировать кнопку обычным способом.
      if ((event.target as HTMLElement | null)?.closest(".multi-select") && [" ", "Enter"].includes(event.key)) return true;
      const key = event.key.toLowerCase();
      if (key === " ") model.togglePause();
      else if (key === "m" || key === "ь") toggleMute();
      else if (key === "arrowup") changeVolume(Number(volume.value) + 10);
      else if (key === "arrowdown") changeVolume(Number(volume.value) - 10);
      else if (["j", "о", "l", "д"].includes(key)) {
        const video = videos[model.activeSlot];
        if (video) seekBy(video, key === "j" || key === "о" ? -15 : 15);
      } else if (key === "escape") opts.exit();
      else return false;
      event.preventDefault();
      render();
      return true;
    },
    get activeVideo(): HTMLVideoElement | null { return videos[model.activeSlot] ?? null; },
    get volume(): number { return Number(volume.value) / 100; },
    get isOpen(): boolean { return model.isOpen; },
  };
}
