export const APK_VERSION_URL = "https://ozyab09.github.io/iptv-hub/version.json";
export const APK_RELEASE_URL = "https://github.com/ozyab09/iptv-hub/releases/latest";
export const APP_SETTINGS_KEY = "iptv-hub.app-settings.v1";
export interface AppSettings { checkUpdates: boolean }
export function parseAppSettings(raw: string | null): AppSettings {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (value && typeof value === "object" && "checkUpdates" in value && typeof value.checkUpdates === "boolean") {
      return { checkUpdates: value.checkUpdates };
    }
  } catch { /* Повреждённые настройки: проверка включена по умолчанию. */ }
  return { checkUpdates: true };
}

export interface ApkVersion { version: string; versionCode: number }
function semver(value: string): number[] | null {
  if (!/^\d+\.\d+\.\d+$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
export function readApkVersion(value: unknown): ApkVersion | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const version = data.version ?? data.versionName;
  if (typeof version !== "string" || !semver(version) || !Number.isSafeInteger(data.versionCode) || (data.versionCode as number) <= 0) return null;
  return { version, versionCode: data.versionCode as number };
}
export function newerApk(remote: ApkVersion, local: ApkVersion): boolean {
  const next = semver(remote.version);
  const current = semver(local.version);
  if (!next || !current || remote.versionCode <= local.versionCode) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== current[i]) return next[i]! > current[i]!;
  }
  // Пересборка той же версии также может иметь более высокий versionCode.
  return true;
}

/** Проверка статического файла; отсутствие сети оставляет офлайн-интерфейс рабочим. */
export async function checkApkUpdate(local: ApkVersion, fetcher: typeof fetch, signal: AbortSignal): Promise<ApkVersion | null> {
  try {
    const response = await fetcher(APK_VERSION_URL, { cache: "no-store", signal });
    if (!response.ok) return null;
    const remote = readApkVersion(await response.json());
    return remote && newerApk(remote, local) ? remote : null;
  } catch { return null; }
}

export function createApkUpdateChecker(options: {
  android: boolean; local: ApkVersion; enabled: () => boolean;
  fetcher: typeof fetch; onUpdate: (version: ApkVersion) => void;
}) {
  let pending: AbortController | null = null;
  let stopped = false;
  let daily: ReturnType<typeof setTimeout> | undefined;
  async function check(): Promise<void> {
    pending?.abort();
    pending = null;
    if (stopped || !options.android || !options.enabled()) return;
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const update = await checkApkUpdate(options.local, options.fetcher, controller.signal);
      if (update && pending === controller && !controller.signal.aborted && !stopped && options.enabled()) options.onUpdate(update);
    } finally {
      clearTimeout(timeout);
      if (pending === controller) pending = null;
    }
  }
  function start(): void {
    if (!options.android || stopped) return;
    clearTimeout(daily);
    void check();
    daily = setTimeout(start, 24 * 60 * 60 * 1000);
  }
  return { start, check, stop: () => { stopped = true; clearTimeout(daily); pending?.abort(); pending = null; } };
}
