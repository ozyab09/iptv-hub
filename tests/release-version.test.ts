import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { latestVersion, nextVersion, planVersion, versionCodeFor, writeVersion } from "../android/scripts/release-version.mjs";

const script = resolve("android/scripts/release-version.mjs");

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

type Repo = { repo: string; origin: string; clean: () => void };

// Мини-репозиторий с bare-origin: проверяем, что тег создаётся и уезжает
// на remote, а не остаётся только локально.
function makeRepo(version = "0.2.6", tags: string[] = []): Repo {
  const root = mkdtempSync(join(tmpdir(), "iptv-version-"));
  const origin = join(root, "origin.git");
  const repo = join(root, "repo");
  mkdirSync(origin);
  mkdirSync(repo);
  git(["init", "--bare", "--quiet"], origin);
  git(["init", "--quiet"], repo);
  git(["config", "user.name", "test"], repo);
  git(["config", "user.email", "test@example.com"], repo);
  mkdirSync(join(repo, "android"));
  mkdirSync(join(repo, "public"));
  writeFileSync(join(repo, "package.json"), `${JSON.stringify({ name: "iptv-hub", version }, null, 2)}\n`);
  writeFileSync(join(repo, "android/version.properties"), `versionCode=${versionCodeFor(version)}\nversionName=${version}\n`);
  writeFileSync(
    join(repo, "public/version.json"),
    `${JSON.stringify({ versionCode: versionCodeFor(version), versionName: version }, null, 2)}\n`,
  );
  git(["add", "."], repo);
  git(["commit", "--quiet", "-m", "init"], repo);
  git(["remote", "add", "origin", origin], repo);
  git(["push", "--quiet", "origin", "HEAD:refs/heads/main"], repo);
  for (const tag of tags) {
    git(["tag", "-a", tag, "-m", tag], repo);
    git(["push", "--quiet", "origin", `refs/tags/${tag}`], repo);
  }
  return { repo, origin, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function run(repo: string, args: string[] = []): { outputs: Record<string, string> } {
  const out = join(repo, "github-output.txt");
  writeFileSync(out, "");
  execFileSync(process.execPath, [script, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: out },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const outputs: Record<string, string> = {};
  for (const line of readFileSync(out, "utf8").trim().split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key) outputs[key] = rest.join("=");
  }
  return { outputs };
}

describe("release-version: чистые функции", () => {
  it("выбирает максимальный semver-тег и игнорирует мусор", () => {
    // v0.2.10 больше v0.2.9 — сравниваем числами, а не строками.
    expect(latestVersion(["v0.2.9", "v0.2.10", "v0.2.6", "nightly", "v1"])).toBe("0.2.10");
    expect(latestVersion([])).toBeNull();
  });

  it("считает следующий патч", () => {
    expect(nextVersion("0.2.6")).toBe("0.2.7");
    expect(nextVersion("0.9.9")).toBe("0.9.10");
    expect(nextVersion(null)).toBe("0.0.1");
  });

  it("считает versionCode по исторической схеме 1000 + patch", () => {
    expect(versionCodeFor("0.2.6")).toBe(1006);
    expect(versionCodeFor("0.2.7")).toBe(1007);
    expect(() => versionCodeFor("0.2.1000")).toThrow();
  });

  it("пишет версию в три файла и не трогает их повторно", () => {
    const { repo, clean } = makeRepo("0.2.6");
    try {
      const plan = { version: "0.2.7", versionCode: 1007 };
      expect(writeVersion(plan, repo).changed).toBe(true);
      expect(writeVersion(plan, repo).changed).toBe(false);
      expect(JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version).toBe("0.2.7");
      expect(readFileSync(join(repo, "android/version.properties"), "utf8")).toBe("versionCode=1007\nversionName=0.2.7\n");
      expect(JSON.parse(readFileSync(join(repo, "public/version.json"), "utf8"))).toEqual({
        versionCode: 1007,
        versionName: "0.2.7",
      });
    } finally {
      clean();
    }
  });

  it("версия из тега события приоритетнее вычисления", () => {
    const { repo, clean } = makeRepo("0.2.6", ["v0.2.6", "v0.3.0"]);
    try {
      expect(planVersion({ cwd: repo, explicit: "0.3.0", fetch: false })).toEqual({
        version: "0.3.0",
        versionCode: 1000,
      });
    } finally {
      clean();
    }
  });

  it("без тегов версия начинается с 0.0.1", () => {
    const { repo, clean } = makeRepo("0.0.0");
    try {
      expect(planVersion({ cwd: repo, fetch: false })).toEqual({ version: "0.0.1", versionCode: 1001 });
    } finally {
      clean();
    }
  });
});

describe("release-version: CLI в репозитории", () => {
  it("на push в main штампует версию и ставит тег на проверяемый коммит", () => {
    const { repo, origin, clean } = makeRepo("0.2.6", ["v0.2.6"]);
    try {
      const { outputs } = run(repo, ["--write", "--ensure-tag"]);
      expect(outputs).toMatchObject({
        version: "0.2.7",
        version_code: "1007",
        changed: "true",
        tag_created: "true",
      });
      // Источник правды — тег: он уезжает в origin и указывает на коммит,
      // который в этом прогоне и собирается.
      expect(git(["rev-parse", "refs/tags/v0.2.7^{commit}"], origin)).toBe(git(["rev-parse", "HEAD"], repo));
      expect(outputs.commit).toBe(git(["rev-parse", "HEAD"], repo));
      // В main CI ничего не коммитит: ruleset запрещает пуш в main.
      expect(git(["log", "-1", "--format=%s"], repo)).toBe("init");
      // Файлы в рабочей копии получают новую версию — её берут Gradle и сборка.
      expect(JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version).toBe("0.2.7");
      expect(readFileSync(join(repo, "android/version.properties"), "utf8")).toBe("versionCode=1007\nversionName=0.2.7\n");
    } finally {
      clean();
    }
  });

  it("каждый прогон с новым тегом выпускает следующий патч", () => {
    const { repo, origin, clean } = makeRepo("0.2.6", ["v0.2.6"]);
    try {
      expect(run(repo, ["--write", "--ensure-tag"]).outputs.version).toBe("0.2.7");
      // Тег v0.2.7 уже стоит — следующий прогон даёт 0.2.8, а не дубль 0.2.7.
      const { outputs } = run(repo, ["--write", "--ensure-tag"]);
      expect(outputs).toMatchObject({ version: "0.2.8", changed: "true", tag_created: "true" });
      expect(git(["tag", "--list"], repo).split("\n").sort()).toEqual(["v0.2.6", "v0.2.7", "v0.2.8"]);
      expect(git(["rev-parse", "refs/tags/v0.2.8^{commit}"], origin)).toBe(git(["rev-parse", "HEAD"], repo));
    } finally {
      clean();
    }
  });

  it("--sync-main (локальный сценарий) коммитит версию с [skip ci]", () => {
    const { repo, clean } = makeRepo("0.2.6", ["v0.2.6"]);
    try {
      run(repo, ["--write", "--sync-main", "--ensure-tag"]);
      expect(git(["log", "-1", "--format=%s"], repo)).toBe("chore: версия 0.2.7 [skip ci]");
      expect(git(["rev-parse", "refs/tags/v0.2.7^{commit}"], repo)).toBe(git(["rev-parse", "HEAD"], repo));
    } finally {
      clean();
    }
  });

  it("--dry-run не создаёт тег", () => {
    const { repo, clean } = makeRepo("0.2.6", ["v0.2.6"]);
    try {
      const before = git(["rev-parse", "HEAD"], repo);
      const { outputs } = run(repo, ["--write", "--ensure-tag", "--dry-run"]);
      expect(outputs).toMatchObject({ version: "0.2.7", tag_created: "true" });
      expect(git(["tag", "--list"], repo)).toBe("v0.2.6");
      expect(git(["rev-parse", "HEAD"], repo)).toBe(before);
    } finally {
      clean();
    }
  });
});
