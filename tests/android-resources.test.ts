import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Смоук-тесты Android-ресурсов: иконка должна быть adaptive, а не одной
 * растровой картинкой, splash — на месте, id пакета — синхронен между
 * Gradle, манифестом и генератором assetlinks. Ошибки в этих файлах ловятся
 * только сборкой APK, поэтому проверяем их до CI.
 */
const app = "android/app/src/main";
const res = join(app, "res");
const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

describe("adaptive icon", () => {
  const adaptive = readFileSync(join(res, "mipmap-anydpi-v26", "ic_launcher.xml"), "utf8");

  it("содержит фон, знак и monochrome-слой", () => {
    expect(adaptive).toContain("<adaptive-icon");
    expect(adaptive).toContain('android:drawable="@color/ic_launcher_background"');
    expect(adaptive).toContain('android:drawable="@mipmap/ic_launcher_foreground"');
    // monochrome — themed icons Android 13+ (Material You).
    expect(adaptive).toContain('android:drawable="@mipmap/ic_launcher_monochrome"');
  });

  it("имеет слои во всех плотностях, включая legacy ic_launcher", () => {
    for (const density of densities) {
      for (const file of ["ic_launcher.png", "ic_launcher_foreground.png", "ic_launcher_monochrome.png"]) {
        const path = join(res, `mipmap-${density}`, file);
        expect(existsSync(path), `${path} отсутствует`).toBe(true);
      }
    }
  });

  it("не оставляет устаревший webp-значок рядом с png", () => {
    for (const density of densities) {
      const files = readdirSync(join(res, `mipmap-${density}`));
      expect(files.filter((f) => f.endsWith(".webp")), `mipmap-${density}`).toEqual([]);
    }
  });

  it("фон знака — акцент дизайн-системы", () => {
    const colors = readFileSync(join(res, "values", "colors.xml"), "utf8");
    expect(colors).toContain('<color name="ic_launcher_background">#FF4FA3</color>');
  });
});

describe("splash screen Android 12+", () => {
  const v31 = readFileSync(join(res, "values-v31", "themes.xml"), "utf8");

  it("использует знак и фон приложения", () => {
    expect(v31).toContain('android:windowSplashScreenAnimatedIcon">@mipmap/ic_splash');
    expect(v31).toContain('android:windowSplashScreenBackground">@color/splash_background');
  });

  it("возвращается к PostSplashTheme, а не к самому себе", () => {
    expect(v31).toContain('android:postSplashScreenTheme">@style/PostSplashTheme');
    const base = readFileSync(join(res, "values", "themes.xml"), "utf8");
    expect(base, "PostSplashTheme должен наследовать LauncherTheme").toContain(
      '<style name="PostSplashTheme" parent="LauncherTheme" />',
    );
  });

  it("знак splash есть во всех плотностях", () => {
    for (const density of densities) {
      expect(existsSync(join(res, `mipmap-${density}`, "ic_splash.png")), density).toBe(true);
    }
  });
});

describe("id пакета синхронен", () => {
  const id = "io.github.ozyab09.iptvhub";

  it("Gradle, манифест и assetlinks используют один applicationId", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    expect(gradle).toContain(`namespace '${id}'`);
    expect(gradle).toContain(`applicationId '${id}'`);

    const gen = readFileSync("android/scripts/gen-assetlinks.mjs", "utf8");
    expect(gen).toContain(`option("--audience", "${id}")`);

    const manifest = readFileSync(join(app, "AndroidManifest.xml"), "utf8");
    expect(manifest).toContain('android:theme="@style/LauncherTheme"');
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    // Класс активити лежит в пакете applicationId.
    expect(existsSync(join(app, "java", ...id.split("."), "MainActivity.java"))).toBe(true);
  });
});

describe("XML ресурсов валиден для aapt2", () => {
  // aapt2 падает на «--» внутри комментария («The string "--" is not permitted
  // within comments»). Ловится только сборкой APK, поэтому проверяем заранее:
  // в комментариях легко написать --accent или --bg по привычке из CSS.
  const xmlFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return xmlFiles(path);
      return entry.name.endsWith(".xml") ? [path] : [];
    });

  it("не содержит двойных дефисов в комментариях", () => {
    for (const file of xmlFiles(res)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/<!--([\s\S]*?)-->/g)) {
        expect(match[1], `${file}: комментарий содержит "--"`).not.toContain("--");
      }
    }
  });
});
