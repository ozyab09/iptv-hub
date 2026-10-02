import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const props = Object.fromEntries(
  readFileSync(new URL("../android/version.properties", import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split("=")),
);
const versionJson = JSON.parse(readFileSync(new URL("../public/version.json", import.meta.url), "utf8")) as {
  versionCode: number;
  versionName: string;
};

/** versionCode = 1000 + patch (см. release-version.mjs: схема проекта). */
function expectedCode(version: string): number {
  return 1000 + Number(version.split(".")[2]);
}

function gitTags(): string[] {
  try {
    return execFileSync("git", ["tag", "--list"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Версия задаётся git-тегом: CI на каждый push в main вычисляет следующий
 * патч, синхронизирует три файла и ставит тег. Тест следит, чтобы файлы не
 * разъехались (раньше это делали руками), а не за конкретным номером.
 */
describe("версия приложения синхронна", () => {
  it("package.json — semver", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("version.properties совпадает с package.json", () => {
    expect(props.versionName).toBe(pkg.version);
    expect(Number(props.versionCode)).toBe(expectedCode(pkg.version));
  });

  it("public/version.json совпадает с package.json", () => {
    expect(versionJson).toEqual({ versionCode: expectedCode(pkg.version), versionName: pkg.version });
  });

  it("файлы — снимок версии, тег может быть новее", () => {
    // Источник правды — тег: CI штампует версию в файлы при сборке, но не
    // коммитит их (ruleset запрещает пуш в main). Поэтому здесь проверяем
    // взаимную согласованность файлов, а не равенство последнему тегу.
    const tags = gitTags();
    if (tags.length === 0) return;
    for (const tag of tags) expect(tag).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});
