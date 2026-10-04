/**
 * MediaSession API (#362): карточка «что играет» на экране блокировки и в
 * шторке уведомлений, кнопки гарнитуры/Bluetooth и системные медиа-кнопки.
 *
 * Чистый модуль: navigator.mediaSession и конструктор MediaMetadata
 * инъецируются, поэтому логика тестируется в node без DOM.
 */

/** Действия системы, которые обрабатывает приложение. */
export type SessionAction =
  | "play"
  | "pause"
  | "stop"
  | "nexttrack"
  | "previoustrack"
  | "seekforward"
  | "seekbackward";

export const SESSION_ACTIONS: readonly SessionAction[] = [
  "play",
  "pause",
  "stop",
  "nexttrack",
  "previoustrack",
  "seekforward",
  "seekbackward",
];

/** Подмножество navigator.mediaSession, которым пользуемся. */
export interface MediaSessionLike {
  metadata: unknown;
  playbackState: "none" | "paused" | "playing";
  setActionHandler(action: SessionAction, handler: (() => void) | null): void;
}

export interface SessionMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: { src: string }[];
}

/** Что показать в системном плеере. */
export interface NowPlayingInfo {
  /** Канал (или подпись записи). */
  title: string;
  /** Текущая передача; пусто — без подзаголовка. */
  artist: string;
  /** Логотип канала или null. */
  artwork: string | null;
}

export interface MediaSessionBridge {
  /** Обновить карточку; повтор тех же данных ничего не пересоздаёт. */
  update(info: NowPlayingInfo): void;
  setPlaying(playing: boolean): void;
  /** Плеер закрыт: карточка снимается, состояние «none». */
  clear(): void;
}

const ALBUM = "IPTV Hub";

/**
 * Логотип в artwork — только https/data: браузер сам грузит картинку для
 * системного UI, и http-логотип на https-странице дал бы mixed content.
 */
export function artworkFor(logo: string | null): { src: string }[] {
  if (!logo || !/^(https:|data:image\/)/i.test(logo)) return [];
  return [{ src: logo }];
}

export function createMediaSessionBridge(
  session: MediaSessionLike | null,
  createMetadata: (init: SessionMetadata) => unknown,
  handlers: Record<SessionAction, () => void>,
): MediaSessionBridge {
  if (session) {
    for (const action of SESSION_ACTIONS) {
      try {
        session.setActionHandler(action, handlers[action]);
      } catch {
        // браузер не знает это действие — остальные работают
      }
    }
  }
  let lastKey: string | null = null;
  return {
    update(info) {
      if (!session) return;
      const key = `${info.title}\n${info.artist}\n${info.artwork ?? ""}`;
      if (key === lastKey) return;
      lastKey = key;
      session.metadata = createMetadata({
        title: info.title,
        artist: info.artist,
        album: ALBUM,
        artwork: artworkFor(info.artwork),
      });
    },
    setPlaying(playing) {
      if (session) session.playbackState = playing ? "playing" : "paused";
    },
    clear() {
      if (!session) return;
      lastKey = null;
      session.metadata = null;
      session.playbackState = "none";
    },
  };
}

/**
 * Одно нажатие медиа-кнопки может прийти дважды: keydown (#392) и
 * обработчик MediaSession. Повтор того же действия в окне отбрасывается,
 * чтобы next не перелистывал два канала, а toggle не отменял сам себя.
 */
export function createActionGate(windowMs: number, now: () => number): (action: string) => boolean {
  let last = "";
  let at = -Infinity;
  return (action) => {
    const t = now();
    if (action === last && t - at < windowMs) return false;
    last = action;
    at = t;
    return true;
  };
}
