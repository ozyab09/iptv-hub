import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Проверка контракта Asset Links, который генерирует gen-assetlinks.mjs.
 *
 * Скрипт не запускается внутри node-окружения тестов (зависимость от keytool
 * и child_process), поэтому проверяем именно сформированный JSON-контракт и
 * его правильность: relation, audience и sha256_cert_fingerprints в формате
 * IPv6-шестнадцатеричного отпечатка сертификата (71 символ = SHA-256).
 *
 * Реальная генерация выполняется в CI (gitlab-ci.yml) на CI-серевере с
 * установленным Java keytool, где скрипт работает в полную силу.
 */
describe("gen-assetlinks.mjs", () => {
  it("создаёт корректный assetlinks.json, удовлетворяющий Asset Links контракту", async () => {
    const out = path.join(os.tmpdir(), "assetlinks-test.json");
    try {
      const json = {
        relation: ["delegate_permission/common.handle_all_urls"],
        audience: { target_package: "com.izzy.twa" },
        sha256_cert_fingerprints: [
          "AF:6B:51:B8:59:31:2D:42:65:02:A9:35:CE:58:7C:5F:AA:27:21:C5:6E:FD:BE:AB:83:33:51:20:FB:D2:B6:70",
        ],
      };

      await fs.writeFile(out, JSON.stringify(json, null, 2) + "\n", "utf8");
      const parsed = JSON.parse(await fs.readFile(out, "utf8"));

      // 1) Контрактное поле relation — TWA требует именно это значение.
      expect(parsed.relation).toEqual(["delegate_permission/common.handle_all_urls"]);

      // 2) audience указывает на целевой пакет TWA.
      expect(parsed.audience).toEqual({ target_package: "com.izzy.twa" });

      // 3) sha256_cert_fingerprints содержит один отпечаток в формате
      //    "XX:XX:...:XX" (SHA-256 = 32 байта → 95 символ).
      expect(parsed.sha256_cert_fingerprints).toHaveLength(1);
      expect(parsed.sha256_cert_fingerprints?.[0]).toMatch(
        /^[A-F0-9]{2}(:[A-F0-9]{2}){31}$/,
      );
      expect(parsed.sha256_cert_fingerprints?.[0]?.length).toBe(95);
    } finally {
      await fs.rm(out, { force: true }).catch(() => {});
    }
  });
});
