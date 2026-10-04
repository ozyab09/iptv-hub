/**
 * Общий фейк хранилища файлов записей (#381): RecordingsFs в памяти.
 * `store` открыт тестам — по нему проверяют, какие файлы легли и исчезли.
 */
import type { RecordingsFs } from "../../src/recordings-store";

export function memoryRecordingsFs(initial: Record<string, Blob> | Map<string, Blob> = {}): RecordingsFs & { store: Map<string, Blob> } {
  const store = initial instanceof Map ? initial : new Map(Object.entries(initial));
  return {
    store,
    read: async (name) => {
      const blob = store.get(name);
      return blob ? (blob instanceof File ? blob : new File([blob], name)) : null;
    },
    write: async (name, blob) => void store.set(name, new File([blob], name)),
    remove: async (name) => void store.delete(name),
    list: async () => [...store.keys()],
  };
}
