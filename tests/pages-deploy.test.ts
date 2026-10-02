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
