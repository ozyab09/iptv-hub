#!/usr/bin/env node
/**
 * Setup script for the TWA/Bubblewrap project.
 *
 * Run after `bubblewrap init --manifest <url>`:
 *   1. Copies public/manifest.webmanifest -> app/src/main/assets/twa-manifest.json
 *      (TWA reads this file as its "manifest" inside the APK).
 *   2. Generates a placeholder assetlinks.json and writes it to
 *      app/src/main/assets/assetlinks-temp.json (CI replaces it with the real
 *      SHA-256 from the signing keystore).
 *   3. Writes public/version.json and app/src/main/assets/version.json with the
 *      current package version (used by UpdateCheck for client-side updates).
 *   4. Updates .gitignore (ignores local.properties, build/, keystore).
 *
 * Usage:
 *   node android/scripts/setup-android.mjs
 *
 * Options:
 *   --android-root <path>   android/ directory (default: ./android)
 *   --version <code.name>   override package version (default: from package.json)
 *   --manifest <url>        public URL of manifest.webmanifest (used to verify)
 */

import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const args = process.argv.slice(2);
const options = {
  androidRoot: path.resolve("android"),
  version: pkg.version,
  manifest: "https://ozyab09.github.io/iptv-hub/manifest.webmanifest",
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--android-root":
      options.androidRoot = path.resolve(args[++i]);
      break;
    case "--version":
      options.version = args[++i];
      break;
    case "--manifest":
      options.manifest = args[++i];
      break;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = options.androidRoot;
const publicDir = path.resolve(root, "..", "public");
const srcMainAssets = path.resolve(root, "app", "src", "main", "assets");
const gitignorePath = path.resolve(root, "..", ".gitignore");

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(p, value) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main() {
  const packageJson = await readJson(
    path.resolve(root, "..", "package.json"),
    { version: "0.2.5" },
  );
  const version = options.version || packageJson.version || "0.2.5";
  const versionCode = String(Number(version.replace(/\./g, "")) + 1);
  const versionName = version;

  const manifest = await readJson(
    path.resolve(root, "..", "public", "manifest.webmanifest"),
    {},
  );

  // 1. Copy manifest into app assets (TWA reads this).
  await fs.mkdir(srcMainAssets, { recursive: true });
  await fs.writeFile(
    path.resolve(srcMainAssets, "twa-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  // 2. Placeholder assetlinks.json (SHA-256 filled by CI from keystore).
  const assetlinksPlaceholder = [
    '{"relation": ["delegate_permission/common.handle_all_urls"],',
    '  "audience": {"target_package": "io.github.ozyab09.iptvhub"}}',
  ].join("\n");
  await fs.writeFile(
    path.resolve(srcMainAssets, "assetlinks-temp.json"),
    assetlinksPlaceholder + "\n",
    "utf8",
  );

  // 3. version.json for client-side update check (written to Pages and APK).
  const versionJson = { versionCode, versionName };
  await writeJson(path.resolve(publicDir, "version.json"), versionJson);
  await writeJson(path.resolve(srcMainAssets, "version.json"), versionJson);

  // 4. .gitignore updates (idempotent).
  let gitignore = "";
  try {
    gitignore = await fs.readFile(gitignorePath, "utf8");
  } catch {
    /* file may not exist yet */
  }
  const patterns = [
    "local.properties",
    "app/build/",
    "app/release/",
    "*.apk",
    "*.aab",
    ".gradle/",
    "keystore.jks",
    "keystore.p12",
  ];
  const lines = [
    "# Android/TWA build output (see .gitignore in android/ for the full set)",
    ...patterns.map((p) => `android/${p}`),
    "",
  ];
  const existing = gitignore.split("\n").filter((l) => !l.startsWith("# Android"));
  const filtered = existing.filter((l) => !patterns.some((p) => l.trim() === `android/${p}`));
  await fs.writeFile(gitignorePath, [...filtered, ...lines].join("\n"), "utf8");

  console.log(`TWA setup complete:`);
  console.log(`  - twa-manifest.json in app/src/main/assets/`);
  console.log(`  - assetlinks-temp.json (placeholder, CI replaces with real SHA-256)`);
  console.log(`  - version.json (versionCode=${versionCode}, versionName=${versionName})`);
  console.log(`  - .gitignore updated`);
  console.log(`  - manifest URL: ${options.manifest}`);
}

main().catch((err) => {
  console.error("TWA setup failed:", err);
  process.exit(1);
});
