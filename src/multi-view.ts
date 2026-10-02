import type { Channel } from "./types";

export type MultiSlot = 0 | 1 | 2 | 3;
export interface MultiPlayer {
  play(channel: Channel): string | null;
  stop(): void;
  setVolume(volume: number): void;
  togglePause(): void;
}

/**
 * Раскладка сетки, которую можно вернуть при повторном входе (#254).
 * Хранится в памяти модели: перезагрузка страницы её не восстанавливает —
 * иначе четыре потока начали бы играть без единого действия пользователя.
 */
export interface MultiLayout {
  /** Каналы четырёх окон; null — окно пустое. */
  channels: (Channel | null)[];
  /** Окно, активное при выходе (звук был у него). */
  active: MultiSlot;
  /** URL канала, возобновлённого одиночным плеером при выходе. */
  resumedUrl: string | null;
}

/**
 * Решение при входе в мульти-вью (#254): прошлая сетка возвращается, только
 * если текущий канал совпадает с возобновлённым при выходе — после того как
 * пользователь включил другой канал, сетка начинается заново с него.
 *
 * `resolve` переносит URL в каналы ТЕКУЩЕГО плейлиста: исчезнувший из списка
 * канал даёт пустое окно, а не играется по протухшей ссылке.
 */
export function entryPlan(
  saved: MultiLayout | null,
  current: Channel | null,
  resolve: (url: string) => Channel | null,
): MultiLayout {
  const resolved = current ? resolve(current.url) : null;
  const single = (): MultiLayout => ({
    channels: [resolved, null, null, null],
    active: 0,
    resumedUrl: resolved?.url ?? null,
  });
  if (!saved || !resolved || saved.resumedUrl !== resolved.url) return single();

  const channels = ([0, 1, 2, 3] as const).map((index) => {
    const savedChannel = saved.channels[index] ?? null;
    return savedChannel ? resolve(savedChannel.url) : null;
  });
  if (channels.every((channel) => channel === null)) return single();

  const firstFull = channels.findIndex((channel) => channel !== null);
  const active: MultiSlot = channels[saved.active]
    ? saved.active
    : firstFull >= 0
      ? (firstFull as MultiSlot)
      : 0;
  return { channels, active, resumedUrl: resolved.url };
}

/** Жизненный цикл четырёх плееров без DOM: звук только у выбранного окна. */
export function createMultiView(createPlayer: (slot: MultiSlot) => MultiPlayer) {
  let players: MultiPlayer[] = [];
  let channels: (Channel | null)[] = [];
  let active: MultiSlot = 0;
  let volume = 1;
  /** Прошлая раскладка для повторного входа; сбрасывается при смене плейлиста. */
  let lastLayout: MultiLayout | null = null;

  function applyVolume(): void {
    players.forEach((player, index) => player.setVolume(index === active ? volume : 0));
  }

  function close(): Channel | null {
    // Уже закрыто: повторный close не должен затирать запомненную раскладку
    // пустой сеткой (иначе повторный вход ничего не восстановит, #254).
    if (players.length === 0) return null;
    const selected = channels[active] ?? channels.find((channel) => channel !== null) ?? null;
    lastLayout = {
      channels: ([0, 1, 2, 3] as const).map((index) => channels[index] ?? null),
      active,
      resumedUrl: selected?.url ?? null,
    };
    for (const player of players) player.stop();
    players = [];
    channels = [];
    return selected;
  }

  function startLayout(layout: MultiLayout, initialVolume: number): string | null {
    close();
    active = layout.active;
    volume = initialVolume;
    channels = ([0, 1, 2, 3] as const).map((index) => layout.channels[index] ?? null);
    players = ([0, 1, 2, 3] as const).map(createPlayer);
    applyVolume();
    let refused: string | null = null;
    channels.forEach((channel, index) => {
      if (!channel) return;
      const message = players[index]!.play(channel);
      if (refused === null) refused = message;
    });
    return refused;
  }

  return {
    start(channel: Channel, initialVolume: number): string | null {
      return startLayout({ channels: [channel, null, null, null], active: 0, resumedUrl: channel.url }, initialVolume);
    },
    /** Войти с готовым планом — восстановлением прошлой сетки или одной строкой (#254). */
    startLayout,
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
    /** Запомненная раскладка (копия) — для решения о восстановлении при входе. */
    get lastLayout(): MultiLayout | null {
      if (!lastLayout) return null;
      return { channels: [...lastLayout.channels], active: lastLayout.active, resumedUrl: lastLayout.resumedUrl };
    },
    /** Забыть прошлую сетку: смена плейлиста делает её чужой (#254). */
    forgetLayout(): void { lastLayout = null; },
    get isOpen(): boolean { return players.length > 0; },
    get activeSlot(): MultiSlot { return active; },
    get channel(): Channel | null { return channels[active] ?? null; },
    get channels(): readonly (Channel | null)[] { return channels; },
  };
}
