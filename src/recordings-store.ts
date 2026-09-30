/**
 * OPFS-хранилище файлов записей (#159).
 *
 * Готовые записи лежат в OPFS под префиксом `done-`; рабочие `rec-*.part`
 * при завершении записи переименовываются сюда (копированием) — точного
 * rename в OPFS нет. Инъекция каталога позволяет тестировать в node.
 */

export interface RecordingsFs {
  /** Прочитать файл или null. */
  read: (name: string) => Promise<File | null>;
  /** Записать файл целиком. */
  write: (name: string, blob: Blob) => Promise<void>;
  /** Удалить файл (отсутствие не ошибка). */
  remove: (name: string) => Promise<void>;
  /** Перечислить имена файлов. */
  list: () => Promise<string[]>;
}

export const DONE_PREFIX = "done-";

export function recordingFileName(id: string, ext: string): string {
  return `${DONE_PREFIX}${id}.${ext}`;
}

/** Собрать RecordingsFs над OPFS-каталогом браузера или null, где OPFS нет. */
export function createRecordingsFs(): RecordingsFs | null {
  const storage = (navigator as Navigator & {
    storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  }).storage;
  if (!storage?.getDirectory) return null;
  let dirPromise: Promise<FileSystemDirectoryHandle> | null = null;
  const dir = (): Promise<FileSystemDirectoryHandle> =>
    (dirPromise ??= storage.getDirectory!());
  return {
    read: async (name) => {
      try {
        const h = await (await dir()).getFileHandle(name);
        return await h.getFile();
      } catch {
        return null;
      }
    },
    write: async (name, blob) => {
      const h = await (await dir()).getFileHandle(name, { create: true });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
    },
    remove: async (name) => {
      try {
        await (await dir()).removeEntry(name);
      } catch {
        /* файла уже нет */
      }
    },
    list: async () => {
      const out: string[] = [];
      const d = await dir();
      // Dirent-перечисление OPFS: async iterator по именам.
      const entries = d as unknown as { keys?: () => AsyncIterableIterator<string> };
      if (typeof entries.keys === "function") {
        for await (const name of entries.keys()) {
          if (name.startsWith(DONE_PREFIX)) out.push(name);
        }
      }
      return out;
    },
  };
}
