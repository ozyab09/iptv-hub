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

it("github-pages в прогоне кладётся одним условием: release последним, fallback — под guard", () => {
  const text = readFileSync(join(workflowDir, "ci.yml"), "utf8");

  // release: шаг последний в job'е — упавший release не оставляет
  // артефакт в прогоне, и deploy гарантированно уходит во fallback.
  const release = jobSection(text, "release");
  const releaseUpload = release.indexOf("uses: actions/upload-pages-artifact");
  expect(releaseUpload).toBeGreaterThan(-1);
  const releaseSteps = [...release.matchAll(/^      - \S.*$/gm)].map((m) => m[0]);
  expect(releaseSteps.at(-1)).toContain("upload-pages-artifact");

  // deploy: своя загрузка возможна только когда артефакта от release нет,
  // иначе два github-pages снова сломают deploy-pages.
  const deploy = jobSection(text, "deploy");
  const fallbackUpload = deploy.indexOf("uses: actions/upload-pages-artifact");
  expect(fallbackUpload).toBeGreaterThan(-1);
  expect(deploy.slice(Math.max(0, fallbackUpload - 300), fallbackUpload)).toContain(
    "if: needs.release.result != 'success'",
  );
});
