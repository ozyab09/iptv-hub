export interface PlayerSettings {
  maxBufferLength: number;
  lowLatencyMode: boolean;
  diagnosticsTimeoutMs: number;
}

export const PLAYER_SETTINGS_KEY = "iptv-hub.player-settings.v1";
/** Предел локального HLS timeshift; не хранится как пользовательская настройка. */
export const TIMESHIFT_BUFFER_SECONDS = 600;
export const DEFAULT_PLAYER_SETTINGS: Readonly<PlayerSettings> = Object.freeze({
  maxBufferLength: 30,
  lowLatencyMode: false,
  diagnosticsTimeoutMs: 8000,
});

function secondsOrDefault(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value : fallback;
}

/** Недопустимые поля заменяются дефолтами независимо от остальных полей. */
export function sanitizePlayerSettings(value: unknown): PlayerSettings {
  const fields = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    maxBufferLength: secondsOrDefault(fields.maxBufferLength, 5, 600, DEFAULT_PLAYER_SETTINGS.maxBufferLength),
    lowLatencyMode: typeof fields.lowLatencyMode === "boolean" ? fields.lowLatencyMode : DEFAULT_PLAYER_SETTINGS.lowLatencyMode,
    diagnosticsTimeoutMs: secondsOrDefault(fields.diagnosticsTimeoutMs, 1000, 60000, DEFAULT_PLAYER_SETTINGS.diagnosticsTimeoutMs),
  };
}

/** Чтение versioned JSON без обращения к localStorage внутри чистого модуля. */
export function parsePlayerSettings(raw: string | null): PlayerSettings {
  try {
    return sanitizePlayerSettings(raw === null ? null : JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }
}

/** Конфигурация обоих путей создания hls-инстанса (новый канал и retry). */
export function playerHlsConfig(settings: PlayerSettings): {
  enableWorker: boolean; maxBufferLength: number; lowLatencyMode: boolean; backBufferLength: number;
} {
  const safe = sanitizePlayerSettings(settings);
  return { enableWorker: true, maxBufferLength: safe.maxBufferLength, lowLatencyMode: safe.lowLatencyMode, backBufferLength: TIMESHIFT_BUFFER_SECONDS };
}
