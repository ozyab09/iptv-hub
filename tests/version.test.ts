import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const version = pkg.version;

/**
 * Версия пакета должна синхронно подниматься с релизами и статусом в доках.
 * Тест гоняется в CI (job build) — расхождение краснит PR (#113).
 * README сознательно не проверяется: пользовательский документ, версийные
 * пины в нём гниют.
 */
describe("версия package.json синхронна с доками", () => {
  it("version выглядит как semver", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  for (const doc of ["README.md", "ROADMAP.md", "AGENTS.md"]) {
    if (doc === "README.md") continue;
    it(`${doc} упоминает v${version}`, () => {
      const text = readFileSync(new URL(`../${doc}`, import.meta.url), "utf8");
      expect(
        text.includes(`v${version}`),
        `${doc} должен упоминать v${version} — при релизе бампайте версию и в доках`,
      ).toBe(true);
    });
  }
});
