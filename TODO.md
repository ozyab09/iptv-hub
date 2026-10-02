# TODO: передача работы (авто-версия и авто-релиз)

> Составлено 2026-10-02. Ветка, в которой лежит этот файл: `fix/235-version-json-retries`.
> Issue-трекер: [#235](https://github.com/ozyab09/iptv-hub/issues/235) (версии и релизы),
> [#231](https://github.com/ozyab09/iptv-hub/issues/231) (нативное Android-приложение).
> Обязательно прочти `AGENTS.md` (раздел «Android TWA и выпуск APK») — там контракт пайплайна.

---

## 1. Что просил пользователь

1. Новая версия должна создаваться **автоматически на каждом коммите** в `main`.
2. Сборка APK и публикация в GitHub Releases — **автоматически**.
3. Версия в коде — **динамическая, из git-тега** (никаких ручных бампов).

Схема реализована и уже работает на `main` (PR #236, #238, #241). Ниже — что осталось.

---

## 2. Текущее состояние (проверено фактами, не по памяти)

| Факт | Значение |
|---|---|
| Последний тег | `v0.2.9` → коммит `ef3137d` (merge #241) |
| Последний GitHub Release | `v0.2.8` (Assets: `iptv-hub.apk`) |
| Тег без релиза | **`v0.2.9`** — `visual` упал, `release` был пропущен (`skipped`) |
| Живой сайт `/version.json` | `{"versionCode":1006,"versionName":"0.2.6"}` — **устарел** |
| Живой сайт `/sw.js` | `const VERSION = "v0.2.9+f4b2f242b7"` — версия уже из тега |
| Открытый PR этой ветки | [#243](https://github.com/ozyab09/iptv-hub/pull/243) — «version.json при каждом деплое + ретрай визуальных тестов» |
| Открытые чужие PR | #242 (свёрнутый список каналов, другой агент) |

---

## 3. Критический контекст (без него сломаешь пайплайн)

1. **В `main` нельзя пушить даже из CI.** Ruleset `main-protection` отвечает
   `GH013: Changes must be made through a pull request` + `Required status check "build" is expected`.
   Первая версия пайплайна падала именно на `git push origin HEAD:main`. Поэтому:
   - версия **не коммитится** в репозиторий из CI;
   - флаг `--sync-main` в `android/scripts/release-version.mjs` оставлен только
     для локальных запусков и покрыт тестом — в workflow его использовать нельзя.
2. **Источник правды по версии — git-тег.** Файлы `package.json`,
   `android/version.properties`, `public/version.json` в репозитории — снимок и
   могут отставать от последнего тега на версию. Это ожидаемо;
   `tests/version.test.ts` проверяет их **взаимную** согласованность, а не равенство тегу.
3. **Тег и релиз обязаны быть в одном прогоне.** Пуш тега с `GITHUB_TOKEN` не
   запускает новый workflow (защита GitHub от рекурсии).
4. **Не переиспользуй чужой тег.** `ensureTag` падает, если тег `vX.Y.Z` уже
   указывает на другой коммит. Осиротевшие теги (как `v0.2.7`/`v0.2.8` в этой
   истории) приводят к «дыркам» в нумерации.
5. **`release` требует зелёных `build` + `visual` + `android`.** Падение любого
   из них = тег создан, релиза нет. Именно так потерялся `v0.2.9`.
6. **Секреты подписи** (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) заведены. Keystore и пароли —
   в `~/DevOps/AI/iptv-hub/.local-signing/` (в `.gitignore`), отпечаток
   `92:BD:11:C0:F2:7B:B5:4E:62:3A:96:3C:4A:6F:F3:C7:BD:73:81:87:DA:5F:91:32:0E:EC:73:BB:F8:B9:42:57`.
   **Потеря ключа ломает обновления установленного приложения.**

---

## 4. Ближайшие шаги (в порядке приоритета)

### 4.1 Довести PR #243 и проверить прогон main ⬅ начать здесь

- [ ] Дождаться `visual` в прогоне #243 (был `pending` на момент передачи),
      при зелёных — merge (squash) и удалить ветку.
- [ ] Проверить прогон main после merge:
  - `release-check` создал тег **`v0.2.10`** (версия = последний тег + патч);
  - `release` опубликовал GitHub Release с `iptv-hub.apk`;
  - живой `https://ozyab09.github.io/iptv-hub/version.json` = `0.2.10`
    (теперь его штампует и `build`, а не только `release`);
  - живой `sw.js` содержит `v0.2.10+<хэш>`.
- [ ] Если `visual` снова упал на `tests/visual/player-controls-layout.spec.ts`
      (`expect(status.x + status.width).toBeLessThanOrEqual(title.x)`) — это
      структурная гонка layout: статус игрока ещё не ужался до `max-width: 120px`.
      Ретрай уже добавлен в `playwright.config.ts`; если не помогает, чинить
      сам тест (дождаться стабилизации `#player-status`), а не релиз.

### 4.2 Закрыть потерянный `v0.2.9`

Тег есть, релиза нет. Варианты (выбрать один и обосновать в PR/комментарии):

- [ ] **Ручной запуск**: Actions → «CI + Pages» → *Run workflow* (ветка `main`).
      `workflow_dispatch` идёт по пути `manual`: берёт версию из `package.json`
      (там сейчас может быть `0.2.6`) и **создаёт/перезаписывает релиз** этим
      тегом. Проверить, что тег `vX.Y.Z` существует и совпадает с версией из
      `package.json`, иначе релиз уедет не туда.
- [ ] Либо оставить `v0.2.9` без релиза и считать дырку в нумерации нормальной
      (в APK-цепочке это безопасно: `versionCode` монотонно растёт).

### 4.3 Дырки в нумерации

- [ ] Решить политику: если релиз не выпустился (упал визуальный тест), тег уже
      создан и версия «сгорела». Варианты: (а) удалять тег при провале релиза
      (шаг `always()` в `release-check` не сработает — тег во втором job'е),
      (б) считать это нормой и не выравнивать нумерацию, (в) переносить создание
      тега в `release` job после успешной сборки (тогда тег появится только
      вместе с релизом — но тег нужен `release-metadata.mjs`, который проверяет
      совпадение `GITHUB_REF` и версии).
      **Рекомендация:** (б) — проще и не ломает текущие инварианты; задокументировать.

### 4.4 Fullscreen TWA — блокер вне этого репозитория (#231)

- [ ] `https://ozyab09.github.io/.well-known/assetlinks.json` **не отдаётся**:
      корневой репозиторий `ozyab09.github.io` приватный, Pages для него выключен,
      а проверка Digital Asset Links идёт по корню origin. Без файла Chrome
      показывает панель Custom Tab.
      Решение: сделать корневой репозиторий публичным, включить Pages
      (Deploy from a branch, `master`), положить туда `.well-known/assetlinks.json`
      (готовый файл: `.local-signing/assetlinks.json`, package
      `io.github.ozyab09.iptvhub`, отпечаток выше). Проверка:
      `curl -sI https://ozyab09.github.io/.well-known/assetlinks.json` → 200.
- [ ] После публикации переустановить APK и проверить отсутствие панели браузера.

### 4.5 Следующие штрихи «нативности» (issue #231, отдельные PR)

- [ ] `navigator.mediaSession` в web: `metadata` (название канала + `tvg-logo`),
      `setActionHandler('play'|'pause'|'stop'|'seekbackward'|'seekforward')`,
      `setPositionState` — локскрин и шторка как у нативного плеера.
- [ ] App shortcuts: `res/xml/shortcuts.xml` + обработка `?view=` в web
      (`src/views.ts` уже умеет `parseView`).
- [ ] `FocusActivity` + `DelegationService` (уведомления от имени приложения).
- [ ] Апгрейд `androidbrowserhelper` 2.5.0 → 2.7.3: требует AGP ≥ 8.9.1,
      Gradle ≥ 8.11.1, compileSdk 36 (у 2.6+ транзитивный `browser` c
      `minCompileSdk=36`) — пакетный апгрейд toolchain, нужен для Google Play
      (там с 31.08.2026 требуется targetSdk 36).
- [ ] Проверка на физическом устройстве: adaptive-иконка, themed icons,
      splash, тёмные бары, повторный запуск из лаунчера, edge-to-edge.

---

## 5. Как устроен пайплайн (шпаргалка)

```
push в main
  └─ release-check (permissions: contents: write)
       └─ node android/scripts/release-version.mjs --write --ensure-tag
            · максимальный semver-тег + патч  (0.2.6 → 0.2.7; без тегов → 0.0.1)
            · штампует package.json / android/version.properties / public/version.json
              (versionCode = 1000 + патч)
            · git fetch --tags, создаёт аннотированный тег на HEAD и пушит его
            · outputs: version, version_code
  ├─ build   (needs release-check)  npm test → restore assetlinks из gh-pages
  │          → release-metadata.mjs (version.json) → vite build с APP_VERSION
  │          → upload-pages-artifact (include-hidden-files: true)
  ├─ visual  Playwright (retries: 1 в CI)
  ├─ android assembleDebug/assembleRelease без подписи (валидация)
  ├─ release (needs build+visual+android) подпись → assetlinks → GitHub Release
  └─ deploy  (needs build+release) actions/deploy-pages
```

- `APP_VERSION` прокидывается в `vite.config.ts` → `src/sw-version.ts`
  (`stampVersion`): `dist/sw.js` получает `v<версия>+<хэш index.html>`,
  то есть кэш SW обновляется на каждой сборке. `vX.Y.Z` в `public/sw.js` —
  только fallback для dev-сервера.
- `android/scripts/release-metadata.mjs` проверяет синхронность
  `package.json` ↔ `android/version.properties` и пишет `public/version.json`;
  если `GITHUB_REF` — тег, требует совпадения тега и версии.
- Флаки визуального теста блокируют релиз. Если такое повторится, стоит
  подумать о `continue-on-error` для `visual` **в main** (не в PR) или о том,
  чтобы `release` зависел только от `build` + `android`. **Не решено.**

---

## 6. Полезные команды

```bash
# локальная проверка (без Android SDK)
npm test && npm run build
APP_VERSION=9.9.9 npm run build && grep 'const VERSION' dist/sw.js
/tmp/actionlint .github/workflows/ci.yml        # если бинарь ещё на месте

# локальная проверка Android-ресурсов и Java (aapt2 + javac против android.jar)
/tmp/android-sdk/android-15/aapt2 compile ...   # см. историю PR #232
# Рецепт: aapt2 compile по res/** + aapt2 link -I /tmp/android-sdk/plat/android-35/android.jar,
# затем javac против AAR из /tmp/m2cache (androidbrowserhelper, core, browser,
# annotation-jvm, kotlin-stdlib) — ловит ошибки, которые иначе видны только в CI.

# версия и релизы
git fetch --tags && git tag --list | tail -5
gh release list --repo ozyab09/iptv-hub
gh run list --repo ozyab09/iptv-hub --branch main --limit 3
```

---

## 7. Известные подводные камни (проверено на практике)

- **aapt2 падает на `--` внутри XML-комментария** («The string "--" is not
  permitted within comments»). Тест `tests/android-resources.test.ts` это стережёт.
- **`android:postSplashScreenTheme` не существует в платформе** (он из
  `androidx.core:core-splashscreen` и без префикса `android:`) — ломает
  `mergeReleaseResources`.
- **`android:launchMode="singleTask"`** на `LauncherActivity` ломает повторный
  запуск TWA (в исходниках ABH прямо предупреждают).
- **`actions/upload-pages-artifact` с v4** выбрасывает dot-файлы без
  `include-hidden-files: true` — `.well-known/assetlinks.json` не доезжает до сайта.
- **`gh pr checks` / сервис GitHub периодически отдаёт** «no checks reported» и
  разовые 500/timeout. Прогоны при этом существуют: проверяй
  `gh run list --branch <branch>`.
- **Правки workflow в PR-ветке:** `pull_request`-прогон может не появиться
  (наблюдалось дважды). Обход: пустой коммит (`git commit --allow-empty`) или
  `gh workflow run "CI + Pages" --ref <branch>`.

---

## 8. Что уже сделано и не требует повторения

- Авто-тег и авто-релиз: версия из тега, релиз на каждый push (#236, #241).
- Иконка приложения: adaptive + monochrome + splash 288 dp, web-иконки,
  `scripts/gen-icons.mjs` без зависимостей (#232).
- Тёмная тема окна, системные бары, edge-to-edge, `asset_statements`,
  guard от падения на `quality_enforcement` (#232).
- `applicationId` = `io.github.ozyab09.iptvhub` (синхронно в Gradle, пакете Java,
  `gen-assetlinks.mjs`, тестах).
- Публикация `.well-known/assetlinks.json` на Pages проекта (#230) — но этого
  **недостаточно** для fullscreen, нужен корень origin (см. 4.4).
- Тесты: `tests/release-version.test.ts` (версия, тег, осиротевший тег),
  `tests/version.test.ts` (согласованность файлов),
  `tests/android-resources.test.ts` (иконка, splash, манифест, id).
