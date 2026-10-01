import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const keystore = option("--keystore", "android/app/keystore.jks");
const alias = option("--alias", "tvhub");
const password = option("--password", process.env.ANDROID_KEYSTORE_PASSWORD);
if (!password) throw new Error("Set ANDROID_KEYSTORE_PASSWORD or --password");
const cert = execFileSync("keytool", ["-exportcert", "-keystore", keystore, "-alias", alias,
  "-storepass:env", "ASSETLINKS_STORE_PASSWORD"], {
  env: { ...process.env, ASSETLINKS_STORE_PASSWORD: password }, stdio: ["ignore", "pipe", "pipe"],
});
const fingerprint = createHash("sha256").update(cert).digest("hex").toUpperCase().match(/.{2}/g).join(":");
const output = resolve(option("--output", "public/.well-known/assetlinks.json"));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify([{
  relation: ["delegate_permission/common.handle_all_urls"],
  target: { namespace: "android_app", package_name: option("--audience", "com.izzy.twa"), sha256_cert_fingerprints: [fingerprint] },
}], null, 2) + "\n");
console.log(`Wrote ${output}`);
