/**
 * Общие фейки для тестов (#381): localStorage/sessionStorage в памяти.
 * Поведение как у Web Storage: строки, null для отсутствующих ключей,
 * key(i) и length по порядку вставки.
 */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}
