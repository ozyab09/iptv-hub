import { readFileSync, writeFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const properties = Object.fromEntries(readFileSync("android/version.properties", "utf8").trim().split(/\r?\n/).map((line) => line.split("=")));
const code = Number(properties.versionCode);
if (properties.versionName !== version || !Number.isSafeInteger(code) || code <= 0) throw new Error("Invalid Android version; synchronize package.json and android/version.properties");
const ref = process.env.GITHUB_REF ?? "";
if (ref.startsWith("refs/tags/") && ref !== `refs/tags/v${version}`) throw new Error("Release tag does not match package.json");
writeFileSync("public/version.json", JSON.stringify({ versionCode: code, versionName: version }, null, 2) + "\n");
const sha = process.env.GITHUB_SHA;
if (sha) {
  const sw = readFileSync("public/sw.js", "utf8");
  writeFileSync("public/sw.js", sw.replace(/const VERSION = "[^"]+";/, `const VERSION = "v${version}-${sha.slice(0, 12)}";`));
}
