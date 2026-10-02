import { expect, it, describe } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("android/scripts/release-version.mjs");

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

type Repo = { root: string; repo: string; origin: string; clean: () => void };

// Мини-репозиторий с bare-origin: проверяем, что тег создаётся и уезжает
// на remote, а не только остаётся локально.
function makeRepo(version = "0.2.5"): Repo {
  const root = mkdtempSync(join(tmpdir(), "iptv-version-"));
  const origin = join(root, "origin.git");
  const repo = join(root, "repo");
  mkdirSync(origin);
  mkdirSync(repo);
  git(["init", "--bare", "--quiet"], origin);
  git(["init", "--quiet"], repo);
  git(["config", "user.name", "test"], repo);
  git(["config", "user.email", "test@example.com"], repo);
  writeFileSync(join(repo, "package.json"), `${JSON.stringify({ name: "iptv-hub", version })}\n`);
  git(["add", "package.json"], repo);
  git(["commit", "--quiet", "-m", "init"], repo);
  git(["remote", "add", "origin", origin], repo);
  git(["push", "--quiet", "origin", "HEAD:refs/heads/main"], repo);
  return { root, repo, origin, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function run(repo: string, args: string[] = []): { stdout: string; outputs: Record<string, string> } {
  const out = join(repo, "github-output.txt");
  writeFileSync(out, "");
  const stdout = execFileSync(process.execPath, [script, ...args], {
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
  return { stdout, outputs };
}

describe("release-version", () => {
  it("берёт версию из package.json и создаёт тег на push в main", () => {
    const { repo, origin, clean } = makeRepo("0.2.6");
    try {
      const { outputs } = run(repo, ["--ensure-tag"]);
      expect(outputs).toMatchObject({ version: "0.2.6", tag: "v0.2.6", tag_exists: "false", tag_created: "true" });
      expect(git(["tag", "--list"], repo)).toBe("v0.2.6");
      // Тег аннотированный и уже на remote: коммит тега совпадает с main.
      expect(git(["rev-parse", "refs/tags/v0.2.6^{commit}"], origin)).toBe(git(["rev-parse", "HEAD"], repo));
    } finally {
      clean();
    }
  });

  it("не пересоздаёт существующий тег (идемпотентность повторного пуша)", () => {
    const { repo, clean } = makeRepo("0.2.6");
    try {
      run(repo, ["--ensure-tag"]);
      const { outputs } = run(repo, ["--ensure-tag"]);
      expect(outputs).toMatchObject({ tag: "v0.2.6", tag_exists: "true", tag_created: "false" });
    } finally {
      clean();
    }
  });

  it("видит тег, созданный другим прогоном, после fetch", () => {
    const { root, repo, clean } = makeRepo("0.2.6");
    try {
      const other = join(root, "other");
      execFileSync("git", ["clone", "--quiet", repo, other]);
      git(["config", "user.name", "ci"], other);
      git(["config", "user.email", "ci@example.com"], other);
      git(["tag", "-a", "v0.2.6", "-m", "release"], other);
      git(["push", "origin", "refs/tags/v0.2.6"], other);
      const { outputs } = run(repo, ["--ensure-tag"]);
      expect(outputs).toMatchObject({ tag_exists: "true", tag_created: "false" });
    } finally {
      clean();
    }
  });

  it("dry-run сообщает о теге, но не создаёт его", () => {
    const { repo, clean } = makeRepo("0.2.6");
    try {
      const { outputs } = run(repo, ["--ensure-tag", "--dry-run"]);
      expect(outputs).toMatchObject({ tag_created: "true" });
      expect(git(["tag", "--list"], repo)).toBe("");
    } finally {
      clean();
    }
  });

  it("отклоняет версию не вида X.Y.Z", () => {
    const { repo, clean } = makeRepo("0.2.6-beta.1");
    try {
      expect(() => run(repo, ["--ensure-tag"])).toThrow();
    } finally {
      clean();
    }
  });
});
