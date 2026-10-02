// Типы для node-скрипта версии: тесты импортируют его напрямую, а tsc не
// разбирает .mjs без объявления. Держим в согласии с реализацией
// (android/scripts/release-version.mjs).
declare module "*/release-version.mjs" {
  export interface VersionPlan {
    version: string;
    versionCode: number;
  }

  /** Версия из тега `vX.Y.Z` или null. */
  export function readTagVersion(tag: string): string | null;
  /** Наибольший semver-тег среди строк `vX.Y.Z`. */
  export function latestVersion(tags: string[]): string | null;
  /** Следующий патч: 0.2.6 → 0.2.7; без тегов — 0.0.1. */
  export function nextVersion(current: string | null): string;
  /** versionCode = 1000 + patch (историческая схема проекта). */
  export function versionCodeFor(version: string, base?: number): number;
  /** Список semver-тегов репозитория. */
  export function localTags(cwd: string, fetch?: boolean): string[];
  /** Решение о версии: explicit приоритетнее вычисления из тегов. */
  export function planVersion(options?: {
    cwd?: string;
    explicit?: string | null;
    code?: number | null;
    fetch?: boolean;
  }): VersionPlan;
  /** Записать версию в package.json, version.properties и version.json. */
  export function writeVersion(plan: VersionPlan, cwd?: string): { changed: boolean };
  /** Коммит синхронизации версии с `[skip ci]` и пуш в main. */
  export function commitVersion(
    plan: VersionPlan,
    cwd: string,
    options?: { dryRun?: boolean; ref?: string },
  ): { committed: boolean };
  /** Создать аннотированный тег и запушить его, если тега ещё нет. */
  export function ensureTag(
    plan: VersionPlan & { tag?: string },
    cwd: string,
    options?: { dryRun?: boolean },
  ): { created: boolean; tag: string };
  export function writeOutputs(outputs: Record<string, unknown>, file?: string): void;
  export function run(options?: { cwd?: string; argv?: string[]; outputFile?: string }): {
    version: string;
    versionCode: number;
    changed: boolean;
    tag_created: boolean;
    commit: string;
  };
}
