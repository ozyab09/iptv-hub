/**
 * Экспорт/импорт настроек — DOM-слой поверх чистых backup*.ts (#370, паттерн #123).
 *
 * Формат backup JSON v2 — контракт (backup.ts), здесь только кнопки, файлы
 * и отчёт об импорте. Импорт перезагружает страницу: результат переживает
 * reload через sessionStorage и показывается после запуска (reportImport).
 */
import { buildBackup, parseBackup, recentsKey } from "./backup";
import { missingLocalFiles, readLocalPlaylistFiles, restoreLocalPlaylistFiles } from "./backup-local";
import { readBackupSections, restoreBackup } from "./backup-storage";
import { buildFavoritesM3U } from "./favorites";
import { t, translateMessage, type Language, type TranslationKey, type TranslationParams } from "./i18n";
import type { LocalFs } from "./local-playlist";
import type { Playlist } from "./playlists";
import type { ThemeChoice } from "./theme";
import type { Channel } from "./types";

export const BACKUP_RESULT_KEY = "iptv-hub.backup-result";

export interface BackupUiNodes {
  exportBtn: HTMLButtonElement;
  exportFavBtn: HTMLButtonElement;
  importBtn: HTMLButtonElement;
  importFile: HTMLInputElement;
}

export interface BackupUiDeps {
  nodes: BackupUiNodes;
  storage: Storage;
  session: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  playlists: () => Playlist[];
  activeId: () => string | null;
  favorites: (playlistId: string) => Set<string>;
  /** Каналы активного плейлиста или null, если он не загружен. */
  channels: () => Channel[] | null;
  theme: () => ThemeChoice;
  language: () => Language;
  localFs: () => Promise<LocalFs> | null;
  toast: (message: string) => void;
  notify: (message: string) => void;
  /** Перед экспортом: сохранить позицию просмотра. */
  beforeExport: () => void;
  /** Перед импортом: завершить запись и просмотр (поздний pause не перепишет позиции). */
  beforeImport: () => Promise<void>;
  /** Перезагрузить страницу без p/e/ch, чтобы boot не отменил импорт. */
  reload: () => void;
  download?: (blob: Blob, name: string) => void;
  now?: () => Date;
}

export interface BackupUi {
  /** Показать отчёт об импорте, пережившем перезагрузку. */
  reportImport(): void;
}

function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** «Недавние» каждого плейлиста; битые данные пропускаются. */
function readRecents(storage: Storage, playlists: Playlist[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of playlists) {
    try {
      const raw = storage.getItem(recentsKey(p.id));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        const urls = parsed.filter((x): x is string => typeof x === "string");
        if (urls.length > 0) out[p.id] = urls;
      }
    } catch { /* битые данные — пропускаем */ }
  }
  return out;
}

export function createBackupUi(deps: BackupUiDeps): BackupUi {
  const { nodes } = deps;
  const tr = (key: TranslationKey, params: TranslationParams = {}): string => t(key, deps.language(), params);
  const download = deps.download ?? downloadBlob;
  const now = deps.now ?? (() => new Date());

  function reportMissing(count: number): void {
    if (!count) return;
    const message = tr("backup.localMissing", { count });
    deps.toast(message);
    deps.notify(message);
  }

  async function exportBackup(): Promise<void> {
    nodes.exportBtn.disabled = true;
    nodes.exportBtn.setAttribute("aria-busy", "true");
    try {
      deps.beforeExport();
      const playlists = deps.playlists();
      const favorites: Record<string, string[]> = {};
      for (const p of playlists) {
        const list = deps.favorites(p.id);
        if (list.size > 0) favorites[p.id] = [...list];
      }
      const backup = buildBackup({
        theme: deps.theme(),
        playlists,
        activeId: deps.activeId(),
        favorites,
        recents: readRecents(deps.storage, playlists),
        ...readBackupSections(deps.storage, playlists.map((p) => p.id)),
        language: deps.language(),
      });
      const local = await readLocalPlaylistFiles(backup.playlists, deps.localFs);
      backup.localPlaylists = local.files;
      download(
        new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
        `iptv-hub-backup-${now().toISOString().slice(0, 10)}.json`,
      );
      deps.toast(tr("backup.exported"));
      reportMissing(local.missing.length);
    } catch {
      deps.toast(tr("backup.writeFailed"));
    } finally {
      nodes.exportBtn.disabled = false;
      nodes.exportBtn.removeAttribute("aria-busy");
    }
  }

  // Экспорт избранного в .m3u (FR-11): совместимый файл для любых плееров
  function exportFavorites(): void {
    const channels = deps.channels();
    const activeId = deps.activeId();
    if (!channels || !activeId) {
      deps.toast(tr("backup.openFirst"));
      return;
    }
    const m3u = buildFavoritesM3U(channels, deps.favorites(activeId));
    if (!m3u.includes("#EXTINF")) {
      deps.toast(tr("backup.noFavorites"));
      return;
    }
    download(new Blob([m3u], { type: "audio/x-mpegurl" }), "favorites.m3u");
    deps.toast(tr("backup.favoritesExported"));
  }

  async function importBackup(text: string): Promise<void> {
    const result = parseBackup(text);
    if (!result.ok) {
      deps.toast(tr("backup.importFailed", { reason: translateMessage(result.error, deps.language()) }));
      return;
    }
    const data = result.data;
    await deps.beforeImport();
    let error = false;
    try { await restoreLocalPlaylistFiles(data, deps.localFs, () => restoreBackup(deps.storage, data)); } catch { error = true; }
    try {
      deps.session.setItem(BACKUP_RESULT_KEY, JSON.stringify({ count: data.playlists.length, warnings: result.warnings, missingLocal: missingLocalFiles(data).length, error }));
    } catch { /* Storage unavailable. */ }
    deps.reload();
  }

  nodes.exportBtn.addEventListener("click", () => void exportBackup());
  nodes.exportFavBtn.addEventListener("click", exportFavorites);
  nodes.importBtn.addEventListener("click", () => nodes.importFile.click());
  nodes.importFile.addEventListener("change", () => {
    const file = nodes.importFile.files?.[0];
    if (!file) return;
    file
      .text()
      .then(importBackup)
      .catch(() => deps.toast(tr("error.readFile")))
      .finally(() => {
        nodes.importFile.value = ""; // повторный выбор того же файла тоже сработает
      });
  });

  return {
    reportImport() {
      try {
        const raw = deps.session.getItem(BACKUP_RESULT_KEY);
        deps.session.removeItem(BACKUP_RESULT_KEY);
        if (!raw) return;
        const result = JSON.parse(raw) as { count: number; warnings: string[]; missingLocal?: number; error: boolean };
        deps.toast(tr(result.error ? "backup.writeFailed" : "backup.imported", { count: result.count }));
        if (result.error) return;
        if (result.warnings.length) deps.notify(tr("backup.normalized", { sections: result.warnings.join(", ") }));
        reportMissing(result.missingLocal ?? 0);
      } catch { /* No pending import report. */ }
    },
  };
}
