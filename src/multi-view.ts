import type { Channel } from "./types";

export type MultiSlot = 0 | 1 | 2 | 3;
export interface MultiPlayer {
  play(channel: Channel): string | null;
  stop(): void;
  setVolume(volume: number): void;
  togglePause(): void;
}

/** Жизненный цикл четырёх плееров без DOM: звук только у выбранного окна. */
export function createMultiView(createPlayer: (slot: MultiSlot) => MultiPlayer) {
  let players: MultiPlayer[] = [];
  let channels: (Channel | null)[] = [];
  let active: MultiSlot = 0;
  let volume = 1;

  function applyVolume(): void {
    players.forEach((player, index) => player.setVolume(index === active ? volume : 0));
  }

  function close(): Channel | null {
    const selected = channels[active] ?? channels.find((channel) => channel !== null) ?? null;
    for (const player of players) player.stop();
    players = [];
    channels = [];
    return selected;
  }

  return {
    start(channel: Channel, initialVolume: number): string | null {
      close();
      active = 0;
      volume = initialVolume;
      channels = [channel, null, null, null];
      players = ([0, 1, 2, 3] as const).map(createPlayer);
      applyVolume();
      return players[0]!.play(channel);
    },
    play(channel: Channel): string | null {
      if (players.length === 0) return null;
      channels[active] = channel;
      const refused = players[active]!.play(channel);
      applyVolume();
      return refused;
    },
    select(slot: MultiSlot): void {
      active = slot;
      applyVolume();
    },
    setVolume(value: number): void {
      volume = Math.min(1, Math.max(0, value));
      applyVolume();
    },
    togglePause(): void { if (channels[active]) players[active]?.togglePause(); },
    close,
    get isOpen(): boolean { return players.length > 0; },
    get activeSlot(): MultiSlot { return active; },
    get channel(): Channel | null { return channels[active] ?? null; },
    get channels(): readonly (Channel | null)[] { return channels; },
  };
}
