/**
 * Sleep-таймер (FR-13): «выключить через 30/60/90 мин / в конце передачи».
 *
 * Чистая логика без DOM: состояние таймера + чистые переходы, время —
 * инъекцией (now мс), тики и отмена — вызовами функций. UI-слой вешает
 * результат на видео и затемнение.
 */

/** Режим таймера. */
export type SleepMode =
  | { kind: "off" }
  | { kind: "duration"; endsAt: number } // абсолютные мс
  | { kind: "episode"; endsAt: number }; // абсолютные мс (конец передачи)

export interface SleepState {
  mode: SleepMode;
  /** Уже сработало: пауза сделана, ждём отмены пользователем. */
  fired: boolean;
}

export const initialSleepState: SleepState = { mode: { kind: "off" }, fired: false };

export const SLEEP_PRESETS_MIN = [30, 60, 90] as const;

/** Включить таймер на N минут от момента now. */
export function sleepStart(
  _state: SleepState,
  minutes: number,
  now: number,
): SleepState {
  return {
    mode: { kind: "duration", endsAt: now + minutes * 60_000 },
    fired: false,
  };
}

/** Таймер «в конце передачи»: конец передачи — мс эпохи. */
export function sleepStartEpisode(
  _state: SleepState,
  episodeEndMs: number,
  now: number,
): SleepState {
  // Передача уже кончается в прошлом — сработает на первом же тике.
  const endsAt = Math.max(episodeEndMs, now);
  return { mode: { kind: "episode", endsAt }, fired: false };
}

/** Выключить таймер (и отменить затемнение). */
export function sleepCancel(_state: SleepState): SleepState {
  return { mode: { kind: "off" }, fired: false };
}

/**
 * Тик: пора ли срабатывать. Срабатывание не сбрасывает режим — бейдж
 * остаётся видимым, отменяет только пользователь (sleepCancel).
 */
export function sleepTick(state: SleepState, now: number): SleepState {
  if (state.mode.kind === "off" || state.fired) return state;
  if (now >= state.mode.endsAt) return { ...state, fired: true };
  return state;
}

/** Остаток в минутах для бейджа (округление вверх), null если выключен. */
export function sleepRemainderMin(state: SleepState, now: number): number | null {
  if (state.mode.kind === "off") return null;
  const ms = state.mode.endsAt - now;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
}

/** Метка для бейджа: «30 мин», «в конце передачи», null — выключен. */
export function sleepLabel(state: SleepState, now: number): string | null {
  if (state.mode.kind === "episode") return "в конце передачи";
  const min = sleepRemainderMin(state, now);
  return min === null ? null : `${min} мин`;
}

/**
 * Таймер переживает смену канала? Да — но пауза эфира не отменяет таймер:
 * он продолжит тикать. Явная отмена — только через sleepCancel.
 */
export function sleepSurvivesChannelChange(state: SleepState): SleepState {
  return state;
}
