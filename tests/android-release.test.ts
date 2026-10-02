import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const script = resolve("android/scripts/release-metadata.mjs");
function run(properties: string, ref = "refs/tags/v0.2.5") {
  const dir = mkdtempSync(join(tmpdir(), "iptv-release-"));
  mkdirSync(join(dir, "android"));
  mkdirSync(join(dir, "public"));
  writeFileSync(join(dir, "package.json"), '{"version":"0.2.5"}');
  writeFileSync(join(dir, "android/version.properties"), properties);
  writeFileSync(join(dir, "public/sw.js"), 'const VERSION = "old";');
  try {
    execFileSync(process.execPath, [script], { cwd: dir, env: { ...process.env, GITHUB_REF: ref, GITHUB_SHA: "123456789abcdef" }, stdio: "pipe" });
    return { version: JSON.parse(readFileSync(join(dir, "public/version.json"), "utf8")), sw: readFileSync(join(dir, "public/sw.js"), "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
it("публикует Android versionCode целым числом", () => {
  const result = run("versionCode=1001\nversionName=0.2.5\n");
  expect(result.version).toEqual({ versionCode: 1001, versionName: "0.2.5" });
  // SW штампует vite (src/sw-version.ts), а не release-metadata.
  expect(result.sw).toBe('const VERSION = "old";');
});
it("отклоняет несовпадение Android и package.json", () => {
  expect(() => run("versionCode=1001\nversionName=0.2.6")).toThrow();
});
it("отклоняет неверный тег и нецелые коды", () => {
  expect(() => run("versionCode=1001\nversionName=0.2.5", "refs/tags/v0.2.6")).toThrow();
  for (const code of ["0", "-1", "0.2.5", "NaN"]) expect(() => run(`versionCode=${code}\nversionName=0.2.5`)).toThrow();
});
