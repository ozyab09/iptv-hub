import { afterEach, describe, expect, it, vi } from "vitest";
import { APK_VERSION_URL, APP_SETTINGS_KEY, checkApkUpdate, createApkUpdateChecker, newerApk, parseAppSettings, readApkVersion } from "../src/apk-updates";
import { buildBackup, parseBackup } from "../src/backup";
import { readBackupSections, restoreBackup } from "../src/backup-storage";
import { addNotification, parseNotifications } from "../src/notifications";

const local = { version: "1.2.9", versionCode: 100 };
afterEach(() => vi.useRealTimers());
describe("APK updates", () => {
  it("compares numeric semver and monotonic versionCode, including rebuilt APKs", () => {
    expect(newerApk({ version: "1.2.10", versionCode: 101 }, local)).toBe(true);
    expect(newerApk({ version: "1.3.0", versionCode: 101 }, local)).toBe(true);
    expect(newerApk({ version: "1.2.9", versionCode: 101 }, local)).toBe(true);
    expect(newerApk({ version: "1.2.10", versionCode: 100 }, local)).toBe(false);
    expect(newerApk({ version: "1.2.8", versionCode: 101 }, local)).toBe(false);
    expect(newerApk({ version: "invalid", versionCode: 101 }, local)).toBe(false);
  });
  it("accepts published versionName and version, rejects malformed metadata", () => {
    expect(readApkVersion({ versionName: "1.2.10", versionCode: 101 })).toEqual({ version: "1.2.10", versionCode: 101 });
    expect(readApkVersion({ version: "1.2.10", versionCode: 101 })).not.toBeNull();
    for (const invalid of [null, {}, { version: "x", versionCode: 101 }, { version: "1.2.10", versionCode: "101" }, { version: "1.2.10", versionCode: 0 }]) expect(readApkVersion(invalid)).toBeNull();
  });
  it("uses only the static JSON with no-store and tolerates HTTP, JSON and network failures", async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ versionName: "1.2.10", versionCode: 101 })));
    expect(await checkApkUpdate(local, fetcher, signal)).toEqual({ version: "1.2.10", versionCode: 101 });
    expect(fetcher).toHaveBeenCalledWith(APK_VERSION_URL, { cache: "no-store", signal });
    fetcher.mockResolvedValue(new Response("{}", { status: 503 }));
    expect(await checkApkUpdate(local, fetcher, signal)).toBeNull();
    fetcher.mockResolvedValue(new Response("bad JSON"));
    expect(await checkApkUpdate(local, fetcher, signal)).toBeNull();
    fetcher.mockRejectedValue(new Error("offline"));
    expect(await checkApkUpdate(local, fetcher, signal)).toBeNull();
  });
  it("never requests in web/PWA or when disabled; checks Android at startup and daily", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ version: "1.2.10", versionCode: 101 })));
    let enabled = false;
    const onUpdate = vi.fn();
    const web = createApkUpdateChecker({ android: false, local, enabled: () => true, fetcher, onUpdate });
    web.start(); await web.check(); expect(fetcher).not.toHaveBeenCalled();
    const android = createApkUpdateChecker({ android: true, local, enabled: () => enabled, fetcher, onUpdate });
    android.start(); await android.check(); expect(fetcher).not.toHaveBeenCalled();
    enabled = true; await android.check(); expect(fetcher).toHaveBeenCalledTimes(1); expect(onUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); expect(fetcher).toHaveBeenCalledTimes(2);
    android.stop(); await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("disabling during a pending response cancels notification", async () => {
    let finish!: (value: Response) => void;
    let enabled = true;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const onUpdate = vi.fn();
    const checker = createApkUpdateChecker({ android: true, local, enabled: () => enabled, fetcher, onUpdate });
    const pending = checker.check(); enabled = false; await checker.check();
    finish(new Response(JSON.stringify({ version: "1.2.10", versionCode: 101 }))); await pending;
    expect(onUpdate).not.toHaveBeenCalled(); checker.stop();
  });
  it("aborts a stalled request after eight seconds without an update", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const onUpdate = vi.fn();
    const checker = createApkUpdateChecker({ android: true, local, enabled: () => true, fetcher, onUpdate });
    const pending = checker.check();
    await vi.advanceTimersByTimeAsync(8000); await pending;
    expect(signal?.aborted).toBe(true); expect(onUpdate).not.toHaveBeenCalled(); checker.stop();
  });
  it("settings default safely and round-trip through backup v2 and storage", () => {
    expect(parseAppSettings(null)).toEqual({ checkUpdates: true });
    expect(parseAppSettings('{"checkUpdates":"false"}')).toEqual({ checkUpdates: true });
    const values = new Map([[APP_SETTINGS_KEY, '{"checkUpdates":false}']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const backup = buildBackup({ theme: "light", playlists: [{ id: "one", name: "One", playlistUrl: "https://fixture.test/playlist.m3u", epgUrl: null }], activeId: "one", favorites: {}, ...readBackupSections(storage, ["one"]) });
    expect(backup.appSettings).toEqual({ checkUpdates: false });
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    values.clear(); restoreBackup(storage, parsed.data);
    expect(parseAppSettings(storage.getItem(APP_SETTINGS_KEY))).toEqual({ checkUpdates: false });
  });
  it("notification persistence accepts only valid update versions", () => {
    const list = addNotification([], 1, "Update", 1000, undefined, "1.2.10");
    expect(parseNotifications(JSON.stringify(list))[0]?.updateVersion).toBe("1.2.10");
    expect(parseNotifications(JSON.stringify([{ ...list[0], updateVersion: "javascript:bad" }]))[0]?.updateVersion).toBeUndefined();
  });
});
