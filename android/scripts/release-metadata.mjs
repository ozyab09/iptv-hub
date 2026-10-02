import { readFileSync, writeFileSync } from "node:fs";
// Версию задаёт CI из git-тега: release-version.mjs уже записал её в
// package.json и android/version.properties. Скрипт только проверяет
// синхронность и публикует public/version.json для клиентского
// автообновления TWA (UpdateCheck читает его с сайта).
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const properties = Object.fromEntries(readFileSync("android/version.properties", "utf8").trim().split(/\r?\n/).map((line) => line.split("=")));
const code = Number(properties.versionCode);
if (properties.versionName !== version || !Number.isSafeInteger(code) || code <= 0) throw new Error("Invalid Android version; synchronize package.json and android/version.properties");
const ref = process.env.GITHUB_REF ?? "";
if (ref.startsWith("refs/tags/") && ref !== `refs/tags/v${version}`) throw new Error("Release tag does not match package.json");
writeFileSync("public/version.json", JSON.stringify({ versionCode: code, versionName: version }, null, 2) + "\n");
console.log(`version.json: ${version} (code ${code})`);
