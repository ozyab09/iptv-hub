/**
 * Хранилища для записи эфира.
 *
 * Основное — OPFS (приватная ФС сайта): сегменты уходят на диск по мере
 * прихода, в памяти ничего не копится, а готовый `File` браузер отдаёт в
 * скачивание потоком, не загружая целиком. Это снимает потолок в несколько
 * сотен мегабайт, который был бы у записи в память.
 *
 * Откат — накопление в памяти: там, где OPFS недоступен или запрещён.
 */
import type { RecordingSink } from "./segment-recorder";

/** Рабочие файлы записи в OPFS — по этому префиксу чистим прошлые запуски. */
const WORK_PREFIX = "rec-";

interface OpfsRoot {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  keys?: () => AsyncIterableIterator<string>;
}

interface OpfsFileHandle {
  createWritable(): Promise<OpfsWritable>;
  getFile(): Promise<File>;
}

interface OpfsWritable {
  write(data: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
  abort?: () => Promise<void>;
}

/** Убрать файлы прошлых записей: их уже скачали либо бросили. */
async function sweep(root: OpfsRoot, keep: string, prefix: string): Promise<void> {
  if (typeof root.keys !== "function") return;
  try {
    for await (const name of root.keys()) {
      if (name.startsWith(prefix) && name !== keep) {
        await root.removeEntry(name).catch(() => undefined);
      }
    }
  } catch {
    // перечисление не поддерживается — не страшно, мусор переживём
  }
}

async function createOpfsSink(prefix: string): Promise<RecordingSink | null> {
  const storage = (navigator as Navigator & { storage?: { getDirectory?: () => Promise<OpfsRoot> } })
    .storage;
  if (!storage?.getDirectory) return null;
  const name = `${prefix}${Date.now()}.part`;
  try {
    const root = await storage.getDirectory();
    await sweep(root, name, prefix);
    const handle = await root.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();

    let bytes = 0;
    let failure: Error | null = null;
    // Записи обязаны идти по очереди: параллельные write() перемешали бы куски.
    let queue: Promise<void> = Promise.resolve();

    return {
      kind: "opfs",
      write(chunk) {
        if (failure) return;
        bytes += chunk.byteLength;
        queue = queue.then(() =>
          writable.write(chunk).catch((e: unknown) => {
            failure = e instanceof Error ? e : new Error("сбой записи на диск");
          }),
        );
      },
      size: () => bytes,
      error: () => failure,
      async finish() {
        await queue;
        await writable.close();
        // File лежит на диске: createObjectURL отдаёт его потоком,
        // не вытягивая содержимое в память.
        return handle.getFile();
      },
      async abort() {
        try {
          await (writable.abort?.() ?? writable.close());
        } catch {
          // уже закрыт или отвалился — всё равно удаляем файл
        }
        await root.removeEntry(name).catch(() => undefined);
      },
    };
  } catch (e) {
    console.debug("[iptv-hub] seg: OPFS недоступен:", e);
    return null;
  }
}

function createMemorySink(): RecordingSink {
  const chunks: ArrayBuffer[] = [];
  let bytes = 0;
  return {
    kind: "memory",
    write(chunk) {
      chunks.push(chunk);
      bytes += chunk.byteLength;
    },
    size: () => bytes,
    error: () => null,
    finish() {
      return Promise.resolve(new Blob(chunks));
    },
    abort() {
      chunks.length = 0;
      return Promise.resolve();
    },
  };
}

/** Лучшее доступное хранилище: OPFS, иначе память. */
export async function createRecordingSink(prefix = WORK_PREFIX): Promise<RecordingSink> {
  return (await createOpfsSink(prefix)) ?? createMemorySink();
}
