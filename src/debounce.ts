/**
 * Отложенный вызов с flush/cancel (#357): поиск перерисовывает список один
 * раз после паузы в наборе, а не на каждую букву. Таймеры инъецируются —
 * модуль чистый и тестируется в node.
 */
export interface Debounced {
  /** Запланировать вызов; повтор до истечения задержки переносит его. */
  schedule(): void;
  /** Выполнить запланированный вызов немедленно (если он есть). */
  flush(): void;
  /** Отменить запланированный вызов. */
  cancel(): void;
}

export interface DebounceTimers {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

export function createDebounced(fn: () => void, delayMs: number, timers: DebounceTimers): Debounced {
  let pending: number | null = null;
  const cancel = (): void => {
    if (pending !== null) timers.clear(pending);
    pending = null;
  };
  return {
    schedule() {
      cancel();
      pending = timers.set(() => {
        pending = null;
        fn();
      }, delayMs);
    },
    flush() {
      if (pending === null) return;
      cancel();
      fn();
    },
    cancel,
  };
}
