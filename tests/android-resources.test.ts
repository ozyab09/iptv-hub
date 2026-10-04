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

  it("не тянет атрибуты библиотеки core-splashscreen в платформенную тему", () => {
    // postSplashScreenTheme есть только в androidx.core:core-splashscreen и без
    // префикса android:. С префиксом aapt2 падает на линковке ресурсов.
    expect(v31).not.toContain("android:postSplashScreenTheme");
    expect(readFileSync(join(res, "values", "themes.xml"), "utf8")).not.toContain("PostSplashTheme");
  });

  it("знак splash нарисован под холст 288 dp, а не 108 dp", () => {
    // Платформа маскирует треть знака и растягивает растр: сетка 108 dp
    // превратилась бы в мыло. 288 dp — требование Android 12+.
    const png = readFileSync(join(res, "mipmap-mdpi", "ic_splash.png"));
    const size = png.readUInt32BE(16); // ширина в IHDR
    expect(size).toBeGreaterThanOrEqual(288);
  });

  it("знак splash есть во всех плотностях", () => {
    for (const density of densities) {
      expect(existsSync(join(res, `mipmap-${density}`, "ic_splash.png")), density).toBe(true);
    }
  });
});

describe("манифест локального приложения", () => {
  const manifest = readFileSync(join(app, "AndroidManifest.xml"), "utf8");

  it("не ставит launchMode и не тянет метаданные Chrome Custom Tabs", () => {
    // Приложение самостоятельное: web-сборка в assets/www, TWA-метаданные
    // (DEFAULT_URL, цвета баров, asset_statements) больше не нужны.
    expect(manifest).not.toMatch(/android:launchMode=/);
    expect(manifest).not.toContain("android.support.customtabs.trusted");
    expect(manifest).not.toContain("asset_statements");
    expect(manifest).not.toContain("autoVerify");
  });

  it("объявляет одну launcher-активити", () => {
    expect(manifest).toContain('android:name=".MainActivity"');
    expect(manifest).toContain("android.intent.category.LAUNCHER");
    expect(manifest.match(/<activity/g) ?? []).toHaveLength(1);
  });

  it("тема наследует AppCompat (MainActivity — AppCompatActivity)", () => {
    const base = readFileSync(join(res, "values", "themes.xml"), "utf8");
    expect(base).toContain('parent="Theme.AppCompat.DayNight.NoActionBar"');
    const v31 = readFileSync(join(res, "values-v31", "themes.xml"), "utf8");
    expect(v31).toContain('parent="Theme.AppCompat.DayNight.NoActionBar"');
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

// #372: мост внешнего плеера принимает сообщения только с локального origin
// и отдаёт системе лишь сетевые медиа-схемы с типом video/*.
describe("внешний плеер в Android-приложении", () => {
  const activity = readFileSync(
    join(process.cwd(), "android/app/src/main/java/io/github/ozyab09/iptvhub/MainActivity.java"),
    "utf-8",
  );
  it("мост IPTVHubExternalPlayer ограничен локальным origin и главным фреймом", () => {
    expect(activity).toMatch(/addWebMessageListener\(webView, "IPTVHubExternalPlayer",\s*Collections\.singleton\("https:\/\/" \+ LOCAL_HOST\)/);
    expect(activity).toContain("if (isMainFrame) openInExternalPlayer(message.getData());");
  });
  it("в плеер уходят только сетевые схемы, интент с типом video/* и выбором приложения", () => {
    expect(activity).toContain('Arrays.asList("http", "https", "rtmp", "rtmps", "rtsp", "rtp", "udp", "mms")');
    expect(activity).toContain('intent.setDataAndType(uri, "video/*");');
    expect(activity).toContain("Intent.createChooser(intent, null)");
  });
});
