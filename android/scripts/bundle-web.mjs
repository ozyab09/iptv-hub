// Пакует web-сборку (dist/) в ассеты Android-приложения, чтобы APK запускался
// локально, без GitHub Pages и без сети для оболочки.
//
// Запуск (из корня репозитория, после npm run build):
//   node android/scripts/bundle-web.mjs
//
// Каталог android/app/src/main/assets/www/ — артефакт сборки, в git не попадает
// (см. .gitignore). Скрипт идемпотентен: цель полностью пересоздаётся, поэтому
// старые файлы от прошлых сборок не остаются в APK.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distDir = join(root, "dist");
const assetsDir = join(root, "android", "app", "src", "main", "assets");
const target = join(assetsDir, "www");

if (!existsSync(join(distDir, "index.html"))) {
  throw new Error("dist/index.html не найден: сначала выполните npm run build");
}

// Версия для клиентского автообновления: version.json должен лежать внутри
// ассетов, иначе приложение не сможет сравнить свою сборку с опубликованной.
const properties = Object.fromEntries(
  readFileSync(join(root, "android", "version.properties"), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split("=")),
);

rmSync(target, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });
cpSync(distDir, target, { recursive: true });
writeFileSync(
  join(target, "version.json"),
  JSON.stringify({ versionCode: Number(properties.versionCode), versionName: properties.versionName }, null, 2) + "\n",
);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const packed = files(target);
const bytes = packed.reduce((sum, file) => sum + statSync(file).size, 0);
if (!packed.some((file) => file.endsWith("index.html"))) {
  throw new Error("в ассетах нет index.html");
}
console.log(
  `✅ assets/www: ${packed.length} файлов, ${(bytes / 1024).toFixed(0)} КБ, версия ${properties.versionName} (${properties.versionCode})`,
);
