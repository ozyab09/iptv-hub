// Решение о релизе Android-APK для прогона CI.
//
// Зачем отдельный скрипт: тег версии нужно создавать в том же прогоне
// workflow, что и релиз (пуш тега через GITHUB_TOKEN не запускает новый
// прогон — защита GitHub от рекурсии). Логику выбора версии и проверку
// «тег уже есть» держим вне YAML, чтобы её можно было покрыть node-тестами
// без GitHub: см. tests/release-version.test.ts.
//
// Использование (из корня репозитория):
//   node android/scripts/release-version.mjs --ensure-tag
//   node android/scripts/release-version.mjs --ensure-tag --dry-run
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function git(args, cwd, env = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  }).trim();
}

// Личность для аннотированного тега задаём через env: на чистом CI-раннере
// user.name/user.email не настроены, а git config трогать глобально не хочется.
const TAG_IDENTITY = {
  GIT_AUTHOR_NAME: "github-actions[bot]",
  GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
  GIT_COMMITTER_NAME: "github-actions[bot]",
  GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
};

// Тег существует только локально? Пуш ветки тегов не обновляет, поэтому перед
// проверкой тянем теги: иначе уже выпущенная версия выглядела бы новой и релиз
// публиковался бы повторно.
export function detectTag({ cwd = process.cwd(), tag, ensure = false, dryRun = false, fetch = true } = {}) {
  if (fetch) {
    try {
      git(["fetch", "--tags", "--force", "--quiet"], cwd);
    } catch {
      // Нет сети/remote — решаем по локальным тегам.
    }
  }
  const exists = tagExists(cwd, tag);
  let created = false;
  if (ensure && !exists) {
    if (!dryRun) {
      git(["tag", "-a", tag, "-m", `IPTV Hub ${tag.replace(/^v/, "")}`], cwd, TAG_IDENTITY);
      git(["push", "origin", `refs/tags/${tag}`], cwd);
    }
    created = true;
  }
  return { tag, exists, created };
}

function tagExists(cwd, tag) {
  try {
    git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`], cwd);
    return true;
  } catch {
    return false;
  }
}

export function readPackageVersion(cwd = process.cwd()) {
  const { version } = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
  if (typeof version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new Error(`package.json version '${version}' не semver вида X.Y.Z`);
  }
  return version;
}

export function writeOutputs(outputs, file = process.env.GITHUB_OUTPUT) {
  const lines = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  if (file) appendFileSync(file, `${lines}\n`);
  console.log(lines);
}

export function run({ cwd = process.cwd(), argv = process.argv.slice(2) } = {}) {
  const ensure = argv.includes("--ensure-tag");
  const dryRun = argv.includes("--dry-run");
  const version = readPackageVersion(cwd);
  const tag = `v${version}`;
  const state = detectTag({ cwd, tag, ensure, dryRun });
  writeOutputs({
    version,
    tag,
    // «Тег был» важнее «создан сейчас»: на push ветки при уже существующем
    // теге релиз не выпускаем, а повторный прогон не должен перезаписывать APK.
    tag_exists: state.exists,
    tag_created: state.created,
  });
  return { version, ...state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
