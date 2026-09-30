# Android-приложение (TWA / Bubblewrap)

Кодовая база IPTV Hub — статический PWA, поэтому Android-обёртка не
переписывает приложение: TWA (Trusted Web Activity) просто открывает
`public/manifest.webmanifest` в современном WebView Chrome, получается
ссылочное Android-приложение, которое устанавливается по APK.

## Содержимое каталога

| Путь | Назначение |
| --- | --- |
| `android/app/` | Gradle-проект Bubblewrap/TWA: `build.gradle`, `AndroidManifest.xml`, `MainActivity`, `UpdateCheck`, `assetlinks.json` (placeholder) |
| `android/app/src/main/assets/` | `twa-manifest.json` (копия manifest, читает TWA) и `version.json` (конфиг автообновления) |
| `android/scripts/gen-assetlinks.mjs` | Генератор `assetlinks.json` из Java-клюstore (SHA-256 сертификата) |
| `android/scripts/setup-android.mjs` | Post-init: копирует manifest в assets, генерирует `assetlinks.json`, `version.json`, обновляет `.gitignore` |
| `android/gitlab-ci.yml` | CI: подпись APK, `assembleRelease`, assetlinks, publish к APK в Artifact + Package Registry |
| `public/.well-known/assetlinks.json` | Заполняется CI-`generateAssetLinks` перед деплом (placeholder в репозитории) |
| `public/version.json` | Версия для клиентского автообновления (публикуется на GitHub Pages) |
| `android/README.md` | Этот файл |

## Требования

- macOS / Linux с [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
  (поддерживает `brew install bubblewrap` / `sdkmanager "cmdline-tools;latest" "platforms;android-35" "extras;google;m2repository" "ndk;26.1.10909125"`).
- Java 17+ (JDK 21 рекомендуется) и Android Gradle Plugin 8.7 (Gradle 8.7).
- Keystore в 4 поля (см. ниже) — в CI через Variables, локально через
  `android/local.properties` (не коммитится, `.gitignore`).

## Локальная сборка

```bash
# 1. Скачать twa-manifest.json и version.json в assets
node android/scripts/setup-android.mjs

# 2. Сгенерировать assetlinks.json из локального keystore
node android/scripts/gen-assetlinks.mjs \
  --keystore android/app/keystore.jks \
  --alias tvhub --password <pass> \
  --output android/app/src/main/assets/assetlinks-temp.json

# 3. Прописать assetlinks в public/.well-known/assetlinks.json (берет эталонный SHA-256)
cp android/app/src/main/assets/assetlinks-temp.json public/.well-known/assetlinks.json

# 4. Собрать и подписать релиз
cd android/app
./gradlew clean assembleRelease
cp app/build/outputs/apk/release/app-release-unsigned.apk ../app-release.apk
jarsigner -sigalg SHA256withRSA -digestalg SHA256 -keystore keystore.jks \
  app-release-unsigned.apk tvhub
zipalign -v -p 4 app-release-unsigned.apk app-release.apk

# 5. Установить на Android 10+
adb install -r app-release.apk
```

`bubblewrap init --manifest https://ozyab09.github.io/iptv-hub/manifest.webmanifest`
становится `android/scripts/setup-android.mjs` после ручного прямого запуска.

## Подпись и keystore

Keystore хранится только в CI переменных
(`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) — никогда не коммитится.
Локальные тесты подписывают через `local.properties` (`keystore.file`,
`keystore.alias`, `keystore.password`, `keystore.alias.password`).

## Автообновление (client-side)

При запуске TWA читает `version.json` на Pages:

```json
{
  "versionCode": "0.2.5",
  "versionName": "0.2.5"
}
```

`UpdateCheck` сравнивает `versionCode` с `BuildConfig.VERSION_NAME` и
предлагает обновление:

- совпадение → нижний колонтитул с ссылкой "новая версия 0.2.5";
- `versionCode` выше → `ACTION_VIEW` APK (активирует установщик, если
  Android ≥ 8), иначе показывает `VERSION_NAME` с раскрывающимся меню;
- нижний колонтитул `http-notice` (настройка `?u=1`) отключается на Android,
  чтобы не мешать интерфейсу.

APK публикуется на Pages рядом с `version.json` (статические файлы в
`dist/` пользуются тем же кэшированием). Обновление работает без Play Store
и без сервера: клиент читает `https://ozyab09.github.io/iptv-hub/version.json`
и скачивает APK из `Releases` или Package Registry.

## CI (GitLab, не GitHub)

Workflow `gitlab-ci.yml` запускается при теге `v*`:

1. Устанавливает JDK 17/21, Android SDK, AGP 8.7, Gradle 8.7.
2. Декодирует keystore из `ANDROID_KEYSTORE_B64` в `android/app/keystore.jks`.
3. `assembleRelease` с `--no-daemon` и `--configure-on-demand`.
4. `generateAssetLinks` → `public/.well-known/assetlinks.json` (placeholder →
   актуальный SHA-256) → пушить на Pages (`git push origin HEAD:gh-pages`).
5. `checkAssetLinks` тестом на Android (можно пропустить, так как assetlinks
   проверяется браузером при установке).
6. Загружает `app-release.apk` в Artifact и Package Registry (с тегом
   `v$CI_COMMIT_TAG`, семантический номер `1000` + patch).
7. Обновляет `public/version.json` в релизе (variables
   `VERSION_CODE`/`VERSION_NAME` в GitLab CI) и деплоит `version.json` на Pages.

## Проверка в PR

- `npm run build` + `npm test` (baseline).
- `./gradlew -p android/app compileDebugAndroidTestJavaWithJavac` — проверяет,
  что проект собирается на CI-образе (не зависит от real keystore).
- `adb install -r app-release.apk` на Android 10+ с `adb shell dumpsys
  window | grep -E "DisplayWidth|DisplayHeight"` для проверки fullscreen.

## Пока не реализовано

- `bubblewrap init` автоматически, после `bubblewrap init` — ручная настройка
  `twa-manifest.json` (скрипт `setup-android.mjs` копирует `manifest.webmanifest`).
- Custom tab / deep links (`intent://` → браузер).
- `com.google.android.apps.unveil` — TWA отключён (мобильное устройство не
  поддерживает раздел `androidx.browser`). Фича, находящаяся в `android/`,
  должна быть проверена на `adb shell am start -W -n
  com.izzy.twa/.MainActivity` (TWA-TOOLS).
