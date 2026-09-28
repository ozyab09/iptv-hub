import { defineConfig } from "vitest/config";

// base обязателен: сайт живёт на https://<user>.github.io/iptv-hub/ (подпуть),
// без него Vite кладёт в HTML абсолютные /assets/... → 404 на Pages.
// Относительный base также разрешает открывать dist/ с любого пути (file://, локальные серверы).
export default defineConfig({
  base: "./",
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
