# План рефакторинга IPTV Hub

> Откуда: issue #340. Статус актуальности: v0.2.48 (октябрь 2026).
> Правила игры: без смены контрактов (localStorage-ключи, backup JSON v2,
> GET-параметры, форматы M3U/XMLTV), без новых runtime-зависимостей,
> каждый шаг — отдельный PR с зелёными `npm test` + `npm run build`.
> Приоритеты: **P1** — заметная выгода/риск роста, **P2** — чистота и
> дедупликация, **P3** — можно отложить.

## Контекст

- `src/main.ts` — 4232 строки, ~150 функций: единственный «толстый» UI-слой.
  Чистые модули уже вынесены (m3u, epg, catchup, playlists, …), крупные
  UI-блоки частично инъекционные (playlist-ui, notification-bell, quality-menu,
  timeline-guide-ui, group-preferences-ui, parental-pin-ui, recording-schedule-ui,
  multi-view-ui). Осталось добрать остальные блоки по тому же паттерну
  (issue #123): `createXxx(deps)` + фейки в тестах.
- ⚠️ Общая ловушка main.ts: топ-левельный код исполняется по порядку, вызов
  функции, трогающей `const X = createX(...)` до её объявления, даёт
  TDZ-краш всего приложения (tsc не ловит — только Playwright-спеки).

---

## P1 — вынос блоков из main.ts

Каждый пункт = вынос в инъекционный DOM-модуль + юнит-тесты на фейках.
Порядок — от наименее связанного к самому связанному.

1. **Скриншот кадра** (~2671–2765: `takeScreenshot`, кнопка, хоткей)
   → `screenshot-ui.ts`. Зависимости: `videoEl`, `multiViewUi`, toast, i18n.
   Самая маленькая и автономная единица — хороший «пилот» паттерна.
   **Сделано в #364:** хоткей остался в main.ts под `canHotkey()` и вызывает
   `screenshotUi.take()`.
2. **Библиотека записей + скачивание** (~2161–2393: `renderRecordings`,
   `playRecording`, `saveRecording`, `offerDownload`, `saveToLibrary`)
   → `recordings-ui.ts`. Контракт воспроизведения (`Player.playRecording`)
   не менять.
   **Сделано в #365:** список, карточки, удаление, `saveToLibrary` и
   `offerDownload` — в модуле; вход в просмотр (`playRecording`) и выбор
   субтитров трогают состояние плеера и остались в main.ts колбэками.
3. **Захват видео/аудио для перекодирующей записи** (~1987–2160:
   `createRecordSource`, `captureFromVideo`, `captureAudioTrack`,
   `canvasHasFrames`, `captureFromCanvas`, `createRecorderAdapter`)
   → `recording-capture.ts`. Дублируется с `programme-downloader.ts` и
   `scheduled-recorder.ts` — см. P2.4.
   **Сделано в #366:** стратегии element → canvas-audio → canvas-silent,
   проба черноты канваса и адаптер MediaRecorder в модуле; остановка сессии
   при черноте — колбэк `onNoFrames`.
4. **Список каналов и виртуализация** (~1202–1520: `ensureVirtualShell`,
   `renderVirtualWindow`, `renderChannels`, `renderChannelLogo`,
   `renderChannelCard`, `renderProgrammeMatch`) → `channel-list-ui.ts`.
   Самый крупный и рискованный блок: прокрутка, фокус, drag&drop избранного,
   бейджи. Делать последним из P1, с визуальными спеками до/после.
   **Сделано в #367:** `channel-list-ui.ts` — виртуальное окно, карточка
   канала, строка результата передачи, логотип, фокус; константы
   `CHANNEL_ROW_HEIGHT`/`CHANNEL_COLUMNS` переехали туда (тест сверяет с CSS).
   Отбор строк (`renderChannels`: раздел, категория, поиск, избранное)
   зависит от состояния main.ts и остался там.
5. **Гайд/расписание** (~2767–2984: `renderGuide`, `programmeRow`,
   `renderSchedule`, `channelProgrammes`) → дорасширение существующего
   `timeline-guide-ui.ts` (или соседний `guide-ui.ts`); `programmeRow()` —
   один строитель для шторки и блока под плеером, это контракт — сохранить.
   **Сделано в #368:** соседний `guide-ui.ts` — шторка-список по дням,
   блок под плеером, `programmeRow()`, карточка передачи (#363) и UI
   скачивания (#359); сетка осталась в `timeline-guide-ui.ts`,
   `channelProgrammes()` — в main.ts (ею пользуются таймлайн и запись).
6. **Полоса прогресса/скраб** (~3106–3236: `refreshScrub`, `scrubPointerTime`,
   `recordingScrubDuration`) → DOM-прослойка над чистым `scrub.ts`.
   **Сделано в #369:** `scrub-ui.ts` — рендер полосы и мини-полоски, slider
   записи (pointer capture, клавиши), «ещё N мин»; `refreshScrub()` в main.ts
   = кнопки плеера + `scrubUi.render()` + MediaSession.
7. **Экспорт/импорт бэкапа** (~3793–3906) → `backup-ui.ts` над чистым
   `backup*.ts`.
   **Сделано в #370:** экспорт JSON, избранное в M3U, импорт и отчёт после
   перезагрузки; остановка записи/просмотра и reload — колбэки main.ts.
8. **Кросс-таб обработчик `storage`** (~3738–3789) → реакции (перечитать
   состояние, перерисовать) в модуль с инъекцией колбэков; `classifyStorageChange`
   уже в `cross-tab.ts`.
   **Сделано в #371:** порядок и выбор реакций — чистый `applyStorageChange`
   в `cross-tab.ts` (ключи активного плейлиста спрашиваются на каждом шаге);
   тела реакций мутируют состояние main.ts и остались там словарём
   `storageReactions`, поэтому сокращения main.ts этот шаг не даёт.

После каждого шага: `main.ts` должен уменьшиться на 100–400 строк; визуальные
спеки обязательны (только они ловят TDZ).

## P2 — дедупликация и структура

1. **Ключи «плейлист-scoped» в localStorage.** Одинаковый паттерн
   `iptv-hub.<name>.v1:<playlist-id>` повторяется в `channel-health.ts`,
   `group-preferences.ts`, `parental-pin.ts`, `favorites.ts`,
   `favorites-order.ts`, `channel-overrides.ts` и т.д. → общий хелпер
   `playlist-scoped-key.ts` (+ тест на соглашение имён).
   **Сделано в #374:** все девять потребителей на `playlistScopedKey()`.
2. **`i18n.ts` (746 строк).** Разделить словари: `i18n-ru.ts` / `i18n-en.ts`,
   `i18n.ts` оставляет API `t()/tr()/translateMessage()`. Проверить, что
   бандл не теряет tree-shaking (словари сейчас в одном объекте).
   **Сделано в #375:** `i18n.ts` — 58 строк, словари в `i18n-ru.ts` /
   `i18n-en.ts`, реэкспорт `ru`/`en`/`TranslationKey` сохранён; размер
   бандла не изменился (262 342 байта до и после).
3. **`player.ts` (564 строки).** Разрезать на: ядро (источники/hls-жизненный
   цикл), диагностика фатальных ошибок (retry/CORS/mixed-content), зеркала,
   timeshift-буфер. Публичный API `Player` заморозить до окончания (контракт
   для main/multi-view/scheduled-recorder/programme-downloader).
4. **Общий «движок записи».** `programme-downloader.ts` и `scheduled-recorder.ts`
   повторяют «muted Player + createSegmentSession + sink + сохранение в
   библиотеку» — вынести общий конструктор сессии; ошибки и GC-пути
   (`rec-*.part` / `download-rec-*` / `schedule-rec-*`) держать изолированными
   как сейчас.
5. **Тосты/уведомления.** `showToast`/`pushNotification`/`showToastAction`
   в main.ts — тонкая прослойка над `notifications.ts`/`notification-bell.ts`;
   унифицировать точку входа (один объект `ui-feedback` с инъекцией), чтобы
   новые модули не тянули main.

## P3 — когда-нибудь

1. **Legacy-пути миграции** (`config.ts` legacy-ключ, старые схемы backup) —
   удалить после оговорённого периода (заметка в README о версии-водоразделе).
2. **`style.css`** (~2k+ строк) — рассмотреть расщепление на секции
   (layout / player / settings), не трогая `components.css` (копия
   дизайн-системы, правится только в системе).
3. **Стабы для DOM-тестов.** Накопить общий `tests/fakes/` (FakeFs, fake
   Player, fake hls) — сейчас фейки копируются по тест-файлам.
4. **Playwright-покрытие** сгенерированных модулей: минимум один спек на
   вынесенный блок (он же страхует от TDZ).
5. **`views.ts`/`ui-classes.ts`/`refresh.ts`** — уже чистые; только держать
   синхронными с CSS (тесты уже следят).

### P1: браузерное покрытие после выноса (#382)

Все перечисленные спеки входят в CI. `p1-module-boot.spec.ts` проверяет
инициализацию из сохранённых экранов, повторную загрузку без pageerror/TDZ
и настоящие storage-события между двумя вкладками.

| Модуль | Проверка пользовательского действия |
| --- | --- |
| `screenshot-ui.ts` | `screenshot-hotkey.spec.ts`: один PNG по S, ввод в поиске |
| `recordings-ui.ts` | `recording-card.spec.ts`, `recording-playback.spec.ts`: действия и воспроизведение |
| `recording-capture.ts` | `volume-boost.spec.ts`: канвас-запись реальных кадров/звука и просмотр результата |
| `channel-list-ui.ts` | `channel-scroll.spec.ts`, `channel-card-a11y.spec.ts`: виртуализация и фокус |
| `guide-ui.ts` | `programme-card.spec.ts`, `timeline-guide.spec.ts`: карточка, список и сетка |
| `scrub-ui.ts` | `recording-playback.spec.ts`: синхронные полосы, pointer и клавиши |
| `backup-ui.ts` | `backup-v2.spec.ts`, `backup-local.spec.ts`: экспорт/импорт и reload |
| `cross-tab.ts` | `p1-module-boot.spec.ts`, `parental-pin.spec.ts`: тема, избранное и PIN из другой вкладки |

Новый вынесенный блок добавляется в эту таблицу вместе со спекой его действия.

## Инварианты (не менять в любом PR)

- Zero backend, privacy-first, чистые модули без DOM/fetch.
- localStorage-ключи и форматы (включая backup JSON v2, backup без PIN/расписаний).
- GET-параметры `?p=`, `?e=`, `?ch=`, `?debug=1`.
- PWA: относительные пути `./`, SW только в PROD, версия из git-тега,
  bump `VERSION` в `public/sw.js` при изменении shell.
- Контракты AGENTS.md: `programmeRow()` один для шторки и блока, владение
  blob-URL в `Player.playRecording()`, изоляция `.part`-путей записи,
  `canHotkey()`-гвард, порядок `playChannel()` (PIN → скрытие → recents).

## Как брать пункты в работу

Один пункт = один issue + одна ветка `refactor/<slug>` + PR с `Closes #N`.
Перед стартом: `git checkout main && git pull`, метки `agent:<имя>` +
`in-progress`. После: `npm test`, `npm run build`, визуальные спеки,
README/AGENTS при изменении контрактов.
