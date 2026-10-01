import { describe, it, expect } from "vitest";
import { LatestGuard } from "../src/latest";

describe("LatestGuard", () => {
  it("первая задача актуальна", () => {
    const g = new LatestGuard();
    expect(g.begin().isCurrent()).toBe(true);
  });

  it("новая begin() инвалидирует предыдущую (#112)", () => {
    const g = new LatestGuard();
    const first = g.begin();
    const second = g.begin();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("гонка: поздний ответ старой загрузки отбрасывается", async () => {
    const g = new LatestGuard();
    const first = g.begin();
    // Плейлист переключили — началась новая загрузка EPG.
    const second = g.begin();
    // Старая загрузка резолвилась позже новой:
    const microtask = await Promise.resolve().then(() => first.isCurrent());
    expect(microtask).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("много параллельных загрузок — актуальна только последняя", () => {
    const g = new LatestGuard();
    const tasks = [g.begin(), g.begin(), g.begin(), g.begin()];
    expect(tasks.slice(0, 3).every((t) => !t.isCurrent())).toBe(true);
    expect(tasks[3]!.isCurrent()).toBe(true);
  });

  it("isCurrent остаётся true, пока не начата новая задача", () => {
    const g = new LatestGuard();
    const only = g.begin();
    expect(only.isCurrent()).toBe(true);
    expect(only.isCurrent()).toBe(true); // повторные проверки не меняют состояние
  });
});
