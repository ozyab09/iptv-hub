import { describe, expect, it, vi } from "vitest";
import { BACKUP_RESULT_KEY, createBackupUi, type BackupUiDeps } from "../src/backup-ui";
import { t } from "../src/i18n";
import type { Playlist } from "../src/playlists";
import type { Channel } from "../src/types";
import { memoryStorage } from "./fakes/storage";


function fakeButton() {
  const listeners: Record<string, () => void> = {};
  const attrs: Record<string, string> = {};
  return {
    disabled: false,
    value: "",
    files: null as { text(): Promise<string> }[] | null,
    attrs,
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    removeAttribute: (k: string) => { delete attrs[k]; },
    addEventListener: (type: string, fn: () => void) => { listeners[type] = fn; },
    fire: (type: string) => listeners[type]?.(),
    click: () => listeners.click?.(),
  };
}

const playlist: Playlist = { id: "a", name: "TV", playlistUrl: "https://x/p.m3u", epgUrl: null };
const channel: Channel = { name: "Alpha", normalizedName: "alpha", url: "https://x/a.m3u8", tvgId: null, logo: null, group: "G", quality: null, catchupDays: 0, catchupSource: null };

function harness(opts: { favorites?: string[]; channels?: Channel[] | null } = {}) {
  const storage = memoryStorage();
  const session = memoryStorage();
  const nodes = { exportBtn: fakeButton(), exportFavBtn: fakeButton(), importBtn: fakeButton(), importFile: fakeButton() };
  const calls = { toasts: [] as string[], notes: [] as string[], downloads: [] as { name: string; text: Promise<string> }[], beforeExport: 0, beforeImport: 0, reloads: 0 };
  const deps: BackupUiDeps = {
    nodes: nodes as unknown as BackupUiDeps["nodes"],
    storage,
    session,
    playlists: () => [playlist],
    activeId: () => "a",
    favorites: () => new Set(opts.favorites ?? []),
    channels: () => (opts.channels === undefined ? [channel] : opts.channels),
    theme: () => "dark",
    language: () => "en",
    localFs: () => null,
    toast: (m) => calls.toasts.push(m),
    notify: (m) => calls.notes.push(m),
    beforeExport: () => { calls.beforeExport++; },
    beforeImport: async () => { calls.beforeImport++; },
    reload: () => { calls.reloads++; },
    download: (blob, name) => calls.downloads.push({ name, text: blob.text() }),
    now: () => new Date("2026-10-04T10:00:00Z"),
  };
  return { ui: createBackupUi(deps), storage, session, nodes, calls };
}

describe("createBackupUi (#370)", () => {
  it("экспорт: JSON v2 с плейлистами, избранным и недавними; кнопка занята на время записи", async () => {
    const h = harness({ favorites: [channel.url] });
    h.storage.setItem("iptv-hub.recents.v1:a", JSON.stringify([channel.url, 1]));
    h.nodes.exportBtn.click();
    expect(h.nodes.exportBtn.disabled).toBe(true);
    expect(h.nodes.exportBtn.attrs["aria-busy"]).toBe("true");
    await vi.waitFor(() => expect(h.calls.downloads).toHaveLength(1));
    expect(h.calls.beforeExport).toBe(1);
    expect(h.calls.downloads[0]!.name).toBe("iptv-hub-backup-2026-10-04.json");
    const backup = JSON.parse(await h.calls.downloads[0]!.text);
    expect(backup.version).toBe(2);
    expect(backup.playlists).toEqual([playlist]);
    expect(backup.favorites).toEqual({ a: [channel.url] });
    expect(backup.recents).toEqual({ a: [channel.url] });
    expect(h.calls.toasts).toEqual([t("backup.exported", "en")]);
    await vi.waitFor(() => expect(h.nodes.exportBtn.disabled).toBe(false));
    expect(h.nodes.exportBtn.attrs["aria-busy"]).toBeUndefined();
  });

  it("избранное в M3U: без плейлиста, без избранного и успешный файл", async () => {
    const none = harness({ channels: null });
    none.nodes.exportFavBtn.click();
    expect(none.calls.toasts).toEqual([t("backup.openFirst", "en")]);
    const empty = harness();
    empty.nodes.exportFavBtn.click();
    expect(empty.calls.toasts).toEqual([t("backup.noFavorites", "en")]);
    const ok = harness({ favorites: [channel.url] });
    ok.nodes.exportFavBtn.click();
    expect(ok.calls.downloads[0]!.name).toBe("favorites.m3u");
    expect(await ok.calls.downloads[0]!.text).toContain("#EXTINF:-1 group-title=\"G\",Alpha");
  });

  it("импорт: битый файл — тост без перезагрузки; валидный — восстановление, отчёт в session и reload", async () => {
    const bad = harness();
    bad.nodes.importFile.files = [{ text: async () => "not json" }];
    bad.nodes.importFile.fire("change");
    await vi.waitFor(() => expect(bad.calls.toasts).toHaveLength(1));
    expect(bad.calls.toasts[0]).toContain(t("backup.importFailed", "en", { reason: "" }).split(":")[0]!);
    expect(bad.calls.reloads).toBe(0);

    const good = harness();
    const backup = { version: 2, exportedAt: "2026-10-04T00:00:00Z", theme: "light", playlists: [playlist], activeId: "a", favorites: { a: [channel.url] } };
    good.nodes.importFile.files = [{ text: async () => JSON.stringify(backup) }];
    good.nodes.importFile.fire("change");
    await vi.waitFor(() => expect(good.calls.reloads).toBe(1));
    expect(good.calls.beforeImport).toBe(1);
    expect(JSON.parse(good.storage.getItem("iptv-hub.playlists.v1")!)).toEqual([playlist]);
    expect(JSON.parse(good.session.getItem(BACKUP_RESULT_KEY)!)).toMatchObject({ count: 1, error: false });
    expect(good.nodes.importFile.value).toBe("");
  });

  it("отчёт после перезагрузки показывается один раз, с предупреждениями и потерями локальных файлов", () => {
    const h = harness();
    h.session.setItem(BACKUP_RESULT_KEY, JSON.stringify({ count: 2, warnings: ["reminders"], missingLocal: 1, error: false }));
    h.ui.reportImport();
    expect(h.calls.toasts).toEqual([t("backup.imported", "en", { count: 2 }), t("backup.localMissing", "en", { count: 1 })]);
    expect(h.calls.notes).toEqual([t("backup.normalized", "en", { sections: "reminders" }), t("backup.localMissing", "en", { count: 1 })]);
    h.ui.reportImport();
    expect(h.calls.toasts).toHaveLength(2);

    const failed = harness();
    failed.session.setItem(BACKUP_RESULT_KEY, JSON.stringify({ count: 1, warnings: ["x"], error: true }));
    failed.ui.reportImport();
    expect(failed.calls.toasts).toEqual([t("backup.writeFailed", "en", { count: 1 })]);
    expect(failed.calls.notes).toEqual([]);
  });
});
