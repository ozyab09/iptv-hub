/**
 * Wake Lock во время просмотра (FR-7).
 *
 * Чистая обёртка жизненного цикла без DOM: состояние «должен ли экран
 * гореть» + хуки к любому Wake Lock API. UI-слой передаёт request/release,
 * модуль сам обрабатывает повторные запросы, скрытие вкладки и возврат.
 * Где API нет — тихий no-op (все хуки опциональны).
 */

export interface WakeLockHooks {
  /** Запросить удержание экрана. Возвращает release или null (API нет/отказ). */
  request?: () => { release: () => void } | null;
}

/** Состояние обёртки: хотелка + текущий активный замок. */
export interface WakeLockState {
  wanted: boolean;
  active: { release: () => void } | null;
}

export const initialWakeLockState: WakeLockState = { wanted: false, active: null };

function releaseActive(state: WakeLockState): WakeLockState {
  if (!state.active) return state;
  try {
    state.active.release();
  } catch {
    /* замок уже истёк */
  }
  return { ...state, active: null };
}

function acquire(state: WakeLockState, hooks: WakeLockHooks): WakeLockState {
  if (state.active || !hooks.request) return state;
  const lock = hooks.request();
  return lock ? { ...state, active: lock } : state;
}

/**
 * Воспроизведение началось/продолжилось: экран должен гореть.
 * Если вкладка скрыта, замок запрошен не будет — его запросит resume
 * по возврату вкладки.
 */
export function wakeLockPlay(
  state: WakeLockState,
  hooks: WakeLockHooks,
  visible: boolean,
): WakeLockState {
  const next = { ...state, wanted: true };
  return visible ? acquire(next, hooks) : next;
}

/** Пауза/стоп: замок отпускаем, «хотелку» сбрасываем. */
export function wakeLockStop(state: WakeLockState): WakeLockState {
  return releaseActive({ ...state, wanted: false });
}

/** Вкладка скрыта: замок отпускаем (браузер всё равно его снимет), wanted сохраняем. */
export function wakeLockHidden(state: WakeLockState): WakeLockState {
  return releaseActive(state);
}

/**
 * Вкладка снова видима: если playback всё ещё идёт — перезапрашиваем замок.
 */
export function wakeLockVisible(
  state: WakeLockState,
  hooks: WakeLockHooks,
): WakeLockState {
  return state.wanted ? acquire(state, hooks) : state;
}
