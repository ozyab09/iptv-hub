// Версия приложения: единственный источник правды — git-тег `vX.Y.Z`.
//
// Зачем: раньше версию поднимали руками в package.json и
// android/version.properties, и забытый bump означал «push без релиза» либо
// рассинхрон файлов. Теперь при каждом push в main CI вычисляет следующий
// патч (максимальный тег + 1), синхронизирует файлы, создаёт тег и собирает
// релиз — ручной bump не нужен.
//
// Почему тег создаётся здесь, а не отдельным workflow: пуш тега через
// GITHUB_TOKEN не запускает новый прогон (защита GitHub от рекурсии),
// поэтому тег и релиз обязаны быть в одном прогоне.
//
// Использование (из корня репозитория):
//   node android/scripts/release-version.mjs --plan
//   node android/scripts/release-version.mjs --write --ensure-tag
//
// Логика покрыта tests/release-version.test.ts (без сети и GitHub).
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const FILES = ["package.json", "android/version.properties", "public/version.json"];

// Личность для служебного коммита и тега задаётся через env: на чистом
// CI-раннере user.name/user.email не настроены, а глобальный git config
// трогать не хочется.
const BOT = {
  GIT_AUTHOR_NAME: "github-actions[bot]",
  GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
  GIT_COMMITTER_NAME: "github-actions[bot]",
  GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
};

function git(args, cwd, env = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  }).trim();
}

// ---------- Чистые функции версии ----------

/** Версия из тега вида `vX.Y.Z` (или null, если тег не semver). */
export function readTagVersion(tag) {
  const match = /^v([0-9]+\.[0-9]+\.[0-9]+)$/.exec(String(tag).trim());
  return match ? match[1] : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Наибольший semver-тег среди строк `vX.Y.Z` (или null). */
export function latestVersion(tags) {
  let best = null;
  let bestParts = null;
  for (const tag of tags) {
    const version = readTagVersion(tag);
    if (!version) continue;
    const parts = version.split(".").map(Number);
    if (!bestParts || compare(parts, bestParts) > 0) {
      best = version;
      bestParts = parts;
    }
  }
  return best;
}

/** Следующий патч: 0.2.6 → 0.2.7; без тегов — 0.0.1. */
export function nextVersion(current) {
  if (!current || !SEMVER.test(current)) return "0.0.1";
  const [major, minor, patch] = current.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * versionCode: 1000 + patch. Историческая схема проекта (0.2.6 → 1001):
 * в этом мажоре она работает, пока патч не дошёл до 999. Когда дойдёт —
 * нужно поднять minor и сменить базу, иначе versionCode перестанет
 * отличаться у соседних версий.
 */
export function versionCodeFor(version, base = 1000) {
  const patch = Number(version.split(".")[2]);
  if (patch > 999) {
    throw new Error(`патч ${patch} не влезает в versionCode; поднимите minor`);
  }
  return base + patch;
}

/** Список semver-тегов репозитория (пустой, если git недоступен). */
export function localTags(cwd, fetch = false) {
  try {
    if (fetch) {
      // Пуш ветки тегов не обновляет: без fetch уже выпущенная версия
      // выглядела бы новой и релиз ушёл бы повторно.
      git(["fetch", "--tags", "--force", "--quiet"], cwd);
    }
    return git(["tag", "--list"], cwd).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Решение о версии. `explicit` (версия из тега события) приоритетнее
 * вычисления — тогда мы просто синхронизируем файлы с уже выпущенной версией.
 */
export function planVersion({ cwd = process.cwd(), explicit = null, code = null, fetch = true } = {}) {
  const version = explicit ?? nextVersion(latestVersion(localTags(cwd, fetch)));
  if (!SEMVER.test(version)) throw new Error(`версия '${version}' не вида X.Y.Z`);
  return { version, versionCode: code ?? versionCodeFor(version) };
}

// ---------- Запись версии ----------

export function writeVersion({ version, versionCode }, cwd = process.cwd()) {
  const pkgPath = resolve(cwd, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const propsPath = resolve(cwd, "android", "version.properties");
  const props = `versionCode=${versionCode}\nversionName=${version}\n`;
  const jsonPath = resolve(cwd, "public", "version.json");
  const versionJson = JSON.stringify({ versionCode, versionName: version }, null, 2) + "\n";

  const nextPkg = JSON.stringify({ ...pkg, version }, null, 2) + "\n";
  let changed = false;
  if (readFileSync(pkgPath, "utf8") !== nextPkg) {
    writeFileSync(pkgPath, nextPkg);
    changed = true;
  }
  if (readFileSync(propsPath, "utf8") !== props) {
    writeFileSync(propsPath, props);
    changed = true;
  }
  if (readFileSync(jsonPath, "utf8") !== versionJson) {
    writeFileSync(jsonPath, versionJson);
    changed = true;
  }
  return { changed };
}

/** Коммит синхронизации версии. `[skip ci]` обязателен: иначе пуш ветки
 *  запустил бы новый прогон и версия уехала бы по кругу.
 *  `ref` — сообщение о ветке: `HEAD:main` для пушей в main. */
export function commitVersion({ version }, cwd, { dryRun = false, ref = "HEAD:main" } = {}) {
  if (dryRun) return { committed: false };
  git(["add", ...FILES], cwd);
  git(["commit", "-m", `chore: версия ${version} [skip ci]`], cwd, BOT);
  git(["push", "origin", ref], cwd);
  return { committed: true };
}

/** Аннотированный тег версии: создаётся, только если его ещё нет. */
export function ensureTag({ version, tag = `v${version}` }, cwd, { dryRun = false } = {}) {
  if (localTags(cwd, false).includes(tag)) return { created: false, tag };
  if (dryRun) return { created: true, tag };
  git(["tag", "-a", tag, "-m", `IPTV Hub ${version}`], cwd, BOT);
  git(["push", "origin", `refs/tags/${tag}`], cwd);
  return { created: true, tag };
}

export function writeOutputs(outputs, file = process.env.GITHUB_OUTPUT) {
  const lines = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  if (file) appendFileSync(file, `${lines}\n`);
  console.log(lines);
}

// ---------- CLI ----------

export function run({ cwd = process.cwd(), argv = process.argv.slice(2), outputFile } = {}) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i < 0 ? null : argv[i + 1] ?? "";
  };
  const explicit = flag("--version") || process.env.VERSION_NAME || null;
  const code = flag("--code") ? Number(flag("--code")) : process.env.VERSION_CODE ? Number(process.env.VERSION_CODE) : null;
  const dryRun = argv.includes("--dry-run");
  const ref = flag("--ref") || "HEAD:main";
  const plan = planVersion({ cwd, explicit, code });

  let changed = false;
  if (argv.includes("--write")) {
    const written = writeVersion(plan, cwd);
    changed = written.changed;
    if (changed && argv.includes("--sync-main")) commitVersion(plan, cwd, { dryRun, ref });
  }

  let tagCreated = false;
  if (argv.includes("--ensure-tag")) {
    tagCreated = ensureTag(plan, cwd, { dryRun }).created;
  }

  // Коммит синхронизации уже отправлен в main и помечен тегом: остальные job'ы
  // обязаны собирать именно этот коммит, иначе протестируют другой код и
  // отдадут в релиз не то, что протестировано.
  const commit = changed ? git(["rev-parse", "HEAD"], cwd) : "";

  const outputs = {
    version: plan.version,
    version_code: plan.versionCode,
    changed,
    tag_created: tagCreated,
    commit,
  };
  writeOutputs(outputs, outputFile ?? process.env.GITHUB_OUTPUT);
  return { ...plan, ...outputs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
