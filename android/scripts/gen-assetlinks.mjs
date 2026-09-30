#!/usr/bin/env node
/**
 * Generates a Digital Asset Links JSON file (assetlinks.json) from an Android
 * signing keystore. The SHA-256 fingerprint of the certificate is embedded in
 * the `sha256_cert_fingerprints` array, which Android's TWA verification
 * checks against the `audience` in the assetlinks file.
 *
 * Usage:
 *   node android/scripts/gen-assetlinks.mjs --keystore path/to/keystore.jks
 *       --alias myalias --password <pass> --output out.json
 *
 *   # JSON output:
 *   {
 *     "relation": ["delegate_permission/common.handle_all_urls"],
 *     "audience": { "target_package": "com.izzy.twa" },
 *     "sha256_cert_fingerprints": ["AA:BB:..."]
 *   }
 *
 * Check if TWA verification succeeded:
 *   adb shell dumpsys package com.izzy.twa | grep -i "asset"
 *
 * Notes:
 * - The same keystore must be used for all APKs (release + debug) and CI.
 * - Keystore secrets must be passed via CI variables (ANDROID_KEYSTORE_B64,
 *   ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD), never
 *   committed.
 * - `bubblewrap init` generates a placeholder assetlinks.json; this script
 *   replaces it with one generated from the real signing keystore.
 */

import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

function die(msg) {
  console.error(`gen-assetlinks: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { keystore: path.resolve(root, "android", "app", "keystore.jks") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      console.log([
        "Usage: gen-assetlinks --keystore <path> --alias <alias> --password <pass>",
        "                     [--output <path>] [--audience <package>]",
        "",
        "Options:",
        "  --keystore <path>   Path to the Android keystore (default: android/app/keystore.jks)",
        "  --alias <alias>     Key alias (default: tvhub)",
        "  --password <pass>   Keystore password (required)",
        "  --output <path>     Output JSON file (default: android/app/src/main/assets/assetlinks.json)",
        "  --audience <pkg>    Target package (default: com.izzy.twa)",
      ].join("\n"));
      process.exit(0);
    }
    const key = a.startsWith("--") ? a.slice(2) : null;
    if (key) {
      const val = argv[++i];
      if (val === undefined) die(`missing value for --${key}`);
      out[key] = val;
    }
  }
  return out;
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));

  const keystore = path.resolve(opts.keystore);
  const alias = opts.alias || "tvhub";
  const password = opts.password;
  if (!password) die("missing --password");
  const output = path.resolve(opts.output || root, "android", "app", "src", "main", "assets", "assetlinks.json");
  const audience = opts.audience || "com.izzy.twa";

  // Export certificate from keystore (RFC 1421 PEM, single certificate, no
  // chain). keytool outputs "-----BEGIN CERTIFICATE-----" ... "-----END
  // CERTIFICATE-----" with line wrapping; inject newlines every 64 chars.
  let pem;
  try {
    pem = execFileSync(
      "keytool",
      [
        "-exportcert",
        "-alias",
        alias,
        "-keystore",
        keystore,
        "-rfc",
        "-storepass",
        password,
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (err) {
    const code = err.status || err.statusCode;
    die(`keytool failed (rc=${code}). Check --keystore, --alias and --password.`);
  }

  const cert = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");

  if (cert.length < 20) die("empty certificate content from keytool");

  // SHA-256 fingerprint as colon-separated hex.
  const hash = execFileSync(
    "keytool",
    [
      "-importcert",
      "-alias",
      alias,
      "-keystore",
      keystore,
      "-rfc",
      "-storepass",
      password,
      "-file",
      "/dev/stdin",
    ],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input: pem },
  );
  // keytool -importcert -rfc prints certificate details; the fingerprint is
  // printed as "Certificate fingerprint (SHA-256): AA:BB:...".
  const m = hash.match(/SHA-256[^:]*:\s*([A-Fa-f0-9:]+)/);
  if (!m) die("could not parse SHA-256 fingerprint from keytool output");

  const fingerprint = m[1]
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9:]/g, "");

  if (!/^[A-F0-9:]+$/.test(fingerprint)) die("invalid fingerprint format");

  const json = {
    relation: ["delegate_permission/common.handle_all_urls"],
    audience: { target_package: audience },
    sha256_cert_fingerprints: [fingerprint],
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log(`Wrote ${output}`);
  console.log(JSON.stringify(json, null, 2));
}

run().catch((err) => {
  console.error("gen-assetlinks failed:", err.message);
  process.exit(1);
});
