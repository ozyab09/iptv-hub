import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// GitHub Pages-деплой идёт через артефакт: actions/upload-pages-artifact с v4
// архивирует с `--exclude=.[^/]*` и по умолчанию выбрасывает скрытые файлы.
// Из-за этого public/.well-known/assetlinks.json не доезжал до живого сайта
// (404), и TWA терял trusted fullscreen. Свойство легко потерять, добавив
// новый деплой, поэтому проверяем его тестом.
const workflowDir = ".github/workflows";

function uploadSteps(text: string): string[] {
  const lines = text.split("\n");
  const steps: string[] = [];
  lines.forEach((line, index) => {
    if (!line.includes("uses: actions/upload-pages-artifact")) return;
    steps.push(lines.slice(index, index + 8).join("\n"));
  });
  return steps;
}

/** Текст job'ы от её заголовка до заголовка следующей. */
function jobSection(text: string, job: string): string {
  text = text.replace(/\r\n/g, "\n");
  const start = text.indexOf(`\n  ${job}:\n`);
  expect(start, `job ${job} не найден`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + 1);
  const body = rest.slice(rest.indexOf("\n") + 1); // без строки заголовка
  const next = body.search(/^ {2}[a-z][\w-]*:$/m);
  return next === -1 ? body : body.slice(0, next);
}

it("каждый upload-pages-artifact собирает скрытые файлы (.well-known)", () => {
  const files = readdirSync(workflowDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  expect(files.length).toBeGreaterThan(0);
  let uploads = 0;
  for (const file of files) {
    for (const step of uploadSteps(readFileSync(join(workflowDir, file), "utf8"))) {
      uploads += 1;
      expect(step, `${file}: в шаге нет include-hidden-files:\n${step}`).toContain("include-hidden-files: true");
    }
  }
  expect(uploads).toBeGreaterThan(0);
});

// Одноимённые артефакты github-pages в одном прогоне роняли deploy-pages
// с "Artifact count is 2" — деплой на Pages не проходил ни на один push в
// main (#250). Правило: github-pages кладёт только release и только
// последним шагом, а build отдаёт запасной артефакт для fallback в deploy.
it("build не кладёт github-pages — только запасной артефакт pages-build", () => {
  const text = readFileSync(join(workflowDir, "ci.yml"), "utf8");
  const build = jobSection(text, "build");
  expect(build).not.toContain("upload-pages-artifact");
  expect(build).toContain("name: pages-build");
  // Скрытые файлы (.well-known) обязаны пережить и эту перезагрузку:
  // deploy распакует pages-build и снова соберёт их в github-pages.
  expect(build).toContain("include-hidden-files: true");
});

it("github-pages в прогоне кладётся одним условием: release-web и release последние, fallback — под guard (#250, #477)", () => {
  const text = readFileSync(join(workflowDir, "ci.yml"), "utf8");

  // release-web (быстрый путь): единственный шаг загрузки — последний.
  const web = jobSection(text, "release-web");
  const webUpload = web.indexOf("uses: actions/upload-pages-artifact");
  expect(webUpload).toBeGreaterThan(-1);
  const webSteps = [...web.matchAll(/^      - \S.*$/gm)].map((m) => m[0]);
  expect(webSteps.at(-1)).toContain("upload-pages-artifact");

  // release: шаг последний в job'е — упавший release не оставляет
  // артефакт в прогоне, и deploy гарантированно уходит во fallback.
  // На push в main быстрый release-web уже положил github-pages, поэтому
  // загрузка release возможна только когда его там нет — иначе два
  // одноимённых артефакта снова сломают deploy-pages.
  const release = jobSection(text, "release");
  const releaseUpload = release.indexOf("uses: actions/upload-pages-artifact");
  expect(releaseUpload).toBeGreaterThan(-1);
  const releaseSteps = [...release.matchAll(/^      - \S.*$/gm)].map((m) => m[0]);
  expect(releaseSteps.at(-1)).toContain("upload-pages-artifact");
  expect(release.slice(releaseUpload, releaseUpload + 300)).toContain(
    "if: needs.release-web.result != 'success'",
  );

  // deploy: своя загрузка возможна только когда артефакта от release-web
  // нет, иначе два github-pages снова сломают deploy-pages.
  const deploy = jobSection(text, "deploy");
  const fallbackUpload = deploy.indexOf("uses: actions/upload-pages-artifact");
  expect(fallbackUpload).toBeGreaterThan(-1);
  expect(deploy.slice(Math.max(0, fallbackUpload - 300), fallbackUpload)).toContain(
    "if: needs.release-web.result != 'success'",
  );
});

it("быстрый deploy не ждёт тяжёлые jobs: needs только build и release-web (#477)", () => {
  const text = readFileSync(join(workflowDir, "ci.yml"), "utf8");
  const deploy = jobSection(text, "deploy");
  expect(deploy).toMatch(/needs: \[[^\]]*\bbuild\b/);
  expect(deploy).toMatch(/needs: \[[^\]]*\brelease-web\b/);
  expect(deploy).not.toMatch(/needs: \[[^\]]*\brelease[^-]\b/);
  expect(deploy).not.toContain("android-tv");
  expect(deploy).not.toContain("companion");
  // release ждёт release-web для взаимоисключения github-pages, но терпит
  // скип android-tv (эмулятор только по тегам).
  const release = jobSection(text, "release");
  expect(release).toMatch(/needs: \[[^\]]*\brelease-web\b/);
  expect(release).toContain("needs.android-tv.result == 'skipped'");
});

it("android-tv только по тегам и ручному запуску, с кэшем Gradle (#477)", () => {
  const text = readFileSync(join(workflowDir, "ci.yml"), "utf8");
  const tv = jobSection(text, "android-tv");
  expect(tv).toContain("startsWith(github.ref, 'refs/tags/v')");
  expect(tv).toContain("github.event_name == 'workflow_dispatch'");
  expect(tv).toContain("path: ~/.gradle/caches");
  expect(tv).toContain("uses: actions/cache@v5");
});

it("без устаревшего actions/cache@v4 (#477)", () => {
  const text = readFileSync(join(workflowDir, "ci.yml"), "utf8");
  expect(text).not.toContain("actions/cache@v4");
});

it("проверки и релиз используют один dist текущего прогона, включая PR", () => {
  const text = readFileSync(join(workflowDir, "ci.yml"), "utf8");
  const build = jobSection(text, "build");
  const upload = build.slice(build.indexOf("- uses: actions/upload-artifact"));
  expect(upload).not.toContain("if:");
  expect(upload).toContain("if-no-files-found: error");
  expect(build).toContain("npm test");
  expect(build).toContain("npm run build");

  for (const name of ["visual", "android", "release-web", "release"]) {
    const job = jobSection(text, name);
    expect(job).toContain("needs.build.result == 'success'");
    expect(job).toMatch(/needs: \[[^\]]*\bbuild\b/);
    expect(job).toMatch(/uses: actions\/download-artifact@v8\n        with:\n          name: pages-build\n          path: dist/);
    expect(job).not.toContain("npm run build");
    if (name !== "visual") expect(job).not.toContain("npm ci");
  }
  const visual = jobSection(text, "visual");
  expect(visual).toContain("project: [chromium, firefox-media]");
  expect(visual).toContain("fail-fast: false");
  expect(visual).toContain("npx playwright test --project=${{ matrix.project }}");
  const android = jobSection(text, "android");
  expect(android).toContain("node android/scripts/bundle-web.mjs");
  expect(android).toContain('"$tools/apksigner" verify');
});

it("версия общей web-сборки, APK и релизных метаданных берётся из release-check", () => {
  const text = readFileSync(join(workflowDir, "ci.yml"), "utf8");
  for (const name of ["build", "android", "release"]) {
    const job = jobSection(text, name);
    expect(job).toContain("VERSION_NAME: ${{ needs.release-check.outputs.version }}");
    expect(job).toContain("VERSION_CODE: ${{ needs.release-check.outputs.version_code }}");
    expect(job).toContain("node android/scripts/release-version.mjs --write");
  }
  const release = jobSection(text, "release");
  expect(release).toContain("cp public/version.json dist/version.json");
  expect(release).toContain("cp public/.well-known/assetlinks.json dist/.well-known/assetlinks.json");
});
