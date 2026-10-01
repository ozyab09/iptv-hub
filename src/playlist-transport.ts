/**
 * Транспорт загрузки плейлистов (issue #123, срез 4): OPFS-адаптер для
 * локальных источников и загрузка/диагностика для http(s). DOM не трогает —
 * устройство хранения и глобали приходят через create, поэтому тестируется
 * в node без DOM и сети.
 */
import type { LocalFs } from "./local-playlist";
import { loadLocalPlaylist } from "./local-playlist";
import { parseM3U } from "./m3u";
import type { PlaylistSnapshot } from "./types";
import { isMixedContent } from "./config";
import { t, type Language } from "./i18n";

/** Минимальная поверхность OPFS-файла, нужная адаптеру (в тестах — фейк). */
export interface OpfsFileLike {
  getFile: () => Promise<{ text: () => Promise<string> }>;
  createWritable: () => Promise<{
    write: (content: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

/** Минимальная поверхность OPFS-каталога (реальный FileSystemDirectoryHandle совместим). */
export interface OpfsDirLike {
  getFileHandle: (key: string, options?: { create?: boolean }) => Promise<OpfsFileLike>;
  removeEntry: (key: string) => Promise<void>;
}

/** Минимальная поверхность navigator.storage (реальный StorageManager совместим). */
export interface OpfsStorageLike {
  getDirectory?: () => Promise<OpfsDirLike>;
}

/**
 * Зависимости транспорта: устройство хранения для `local:`-источников,
 * сетевой доступ и адрес страницы (в тестах — фейки вместо fetch/navigator).
 */
export interface TransportDeps {
  /** Провайдер OPFS-хранилища или null, если OPFS недоступен. */
  fs: () => Promise<LocalFs> | null;
  /** Сетевой доступ; по умолчанию — глобальный fetch. */
  fetch?: (url: string) => Promise<Response>;
  /** Текущий язык интерфейса (тексты ошибок и подсказок). */
  language: () => Language;
  /** Адрес текущей страницы (mixed-content-проверка); по умолчанию location. */
  pageUrl?: () => string;
}

/** Транспорт: загрузка плейлиста и подсказка по сетевому сбою. */
export interface Transport {
  /**
   * Загрузить плейлист: `local:<id>` читается из OPFS (файл не покидает
   * устройство), http(s) — fetch с проверкой статуса и разбором M3U.
   * Ошибки бросаются с уже переведённым сообщением.
   */
  loadPlaylist(url: string): Promise<PlaylistSnapshot>;
  /**
   * Подсказка по причине сетевого сбоя: смешанный контент или CORS.
   * Точная причина от плеера главнее: она знает, что уже предпринято
   * (например, попытку https-порта), и не подменяется общим текстом.
   */
  describeFailure(url: string, reason?: string): string;
}

/**
 * Ленивый OPFS-адаптер: каталог запрашивается при первом обращении,
 * повторные вызовы возвращают закешированный промис (без top-level await —
 * таргет сборки его не даёт). null — OPFS в этом браузере нет.
 */
export function createOpfsFs(storage: OpfsStorageLike | null | undefined): () => Promise<LocalFs> | null {
  let cached: Promise<LocalFs> | null = null;
  return () => {
    if (!storage || !storage.getDirectory) return null;
    if (!cached) {
      cached = storage.getDirectory().then((dir): LocalFs => ({
        read: async (key) => {
          try {
            const h = await dir.getFileHandle(key);
            const f = await h.getFile();
            return await f.text();
          } catch {
            return null;
          }
        },
        write: async (key, content) => {
          const h = await dir.getFileHandle(key, { create: true });
          const w = await h.createWritable();
          await w.write(content);
          await w.close();
        },
        remove: async (key) => {
          try {
            await dir.removeEntry(key);
          } catch {
            /* файла уже нет */
          }
        },
      }));
    }
    return cached;
  };
}

/** Собрать транспорт из зависимостей. */
export function createTransport(deps: TransportDeps): Transport {
  return {
    async loadPlaylist(url) {
      // Локальный источник: маркер local:<id> — читаем содержимое из OPFS.
      if (url.startsWith("local:")) {
        const fs = deps.fs();
        if (!fs) throw new Error(t("error.localOpfs", deps.language()));
        const m3u = await loadLocalPlaylist(await fs, url.slice("local:".length));
        if (m3u === null) throw new Error(t("error.localMissing", deps.language()));
        return parseM3U(m3u);
      }
      const doFetch = deps.fetch ?? fetch;
      const resp = await doFetch(url);
      if (!resp.ok) throw new Error(t("error.httpPlaylist", deps.language(), { status: resp.status }));
      if (!/^application\/(x-mpegurl|vnd\.apple\.mpegurl|octet-stream)/.test(
            resp.headers.get("content-type") ?? "")) {
        // не фейлимся: некоторые бакеты отдают text/plain
      }
      return parseM3U(await resp.text());
    },
    describeFailure(url, reason) {
      // Точная причина от плеера главнее: она знает, что уже предпринято
      // (например, попытку https-порта), и не должна подменяться общим текстом.
      if (reason) return reason;
      const pageUrl = deps.pageUrl
        ? deps.pageUrl()
        : (typeof window !== "undefined" ? window.location.href : "");
      return t(
        isMixedContent(pageUrl, url) ? "error.mixedHint" : "error.corsHint",
        deps.language(),
      );
    },
  };
}
