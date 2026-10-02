import { describe, expect, it, vi } from "vitest";
import { createMultiView, entryPlan, type MultiLayout, type MultiPlayer } from "../src/multi-view";
import type { Channel } from "../src/types";

const channel = (name: string): Channel => ({
  name, normalizedName: name, url: `https://fixture.test/${name}.m3u8`,
  tvgId: null, logo: null, group: "", quality: null, catchupDays: 0, catchupSource: null,
});
function setup() {
  const players: Array<MultiPlayer & { play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; setVolume: ReturnType<typeof vi.fn>; togglePause: ReturnType<typeof vi.fn> }> = [];
  const model = createMultiView(() => {
    const player = { play: vi.fn(() => null), stop: vi.fn(), setVolume: vi.fn(), togglePause: vi.fn() };
    players.push(player);
    return player;
  });
  return { model, players };
}

describe("мульти-вью", () => {
  it("создаёт ровно 4 плеера, запускает только выбранный канал", () => {
    const { model, players } = setup();
    const first = channel("one");
    model.start(first, 0.6);
    expect(players).toHaveLength(4);
    expect(model.channels).toEqual([first, null, null, null]);
    expect(players[0]!.play).toHaveBeenCalledWith(first);
    for (const player of players.slice(1)) expect(player.play).not.toHaveBeenCalled();
    expect(model.isOpen).toBe(true);
  });
  it("звук только у активного окна; выбор и громкость не перезапускают потоки", () => {
    const { model, players } = setup();
    model.start(channel("one"), 0.6);
    model.select(2);
    model.play(channel("two"));
    expect(players.map((p) => p.setVolume.mock.lastCall?.[0])).toEqual([0, 0, 0.6, 0]);
    model.setVolume(0.3);
    expect(players.map((p) => p.setVolume.mock.lastCall?.[0])).toEqual([0, 0, 0.3, 0]);
    model.select(0);
    expect(players.map((p) => p.setVolume.mock.lastCall?.[0])).toEqual([0.3, 0, 0, 0]);
    expect(players[0]!.play).toHaveBeenCalledTimes(1);
    expect(players[2]!.play).toHaveBeenCalledTimes(1);
  });
  it("заменяет и ставит на паузу только выбранный канал", () => {
    const { model, players } = setup();
    model.start(channel("one"), 1);
    model.select(3);
    model.play(channel("two"));
    const replacement = channel("three");
    model.play(replacement);
    model.togglePause();
    expect(model.channel).toEqual(replacement);
    expect(players[3]!.play).toHaveBeenCalledTimes(2);
    expect(players[3]!.togglePause).toHaveBeenCalledOnce();
    expect(players[0]!.togglePause).not.toHaveBeenCalled();
  });
  it("выход закрывает все плееры и возвращает канал активного окна", () => {
    const { model, players } = setup();
    model.start(channel("one"), 1);
    model.select(1);
    const selected = channel("two");
    model.play(selected);
    expect(model.close()).toEqual(selected);
    for (const player of players) expect(player.stop).toHaveBeenCalledOnce();
    expect(model.isOpen).toBe(false);
    expect(model.channels).toEqual([]);
    model.close();
    for (const player of players) expect(player.stop).toHaveBeenCalledOnce();
  });
  it("пустое окно не запускается паузой, выход возвращает заполненное", () => {
    const { model, players } = setup();
    const first = channel("one");
    model.start(first, 1);
    model.select(2);
    model.togglePause();
    expect(players[2]!.togglePause).not.toHaveBeenCalled();
    expect(model.close()).toEqual(first);
  });
  it("повторный вход закрывает прошлую сетку без накопления плееров", () => {
    const { model, players } = setup();
    for (let i = 0; i < 3; i++) model.start(channel(String(i)), 1);
    for (const player of players.slice(0, 8)) expect(player.stop).toHaveBeenCalledOnce();
    model.close();
    for (const player of players) expect(player.stop).toHaveBeenCalledOnce();
  });
  it("возвращает отказ плеера и ограничивает громкость", () => {
    const { model, players } = setup();
    model.start(channel("one"), 1);
    players[0]!.play.mockReturnValue("unsupported");
    expect(model.play(channel("dash"))).toBe("unsupported");
    model.setVolume(-1);
    expect(players[0]!.setVolume).toHaveBeenLastCalledWith(0);
    model.setVolume(2);
    expect(players[0]!.setVolume).toHaveBeenLastCalledWith(1);
  });
});

describe("восстановление раскладки (#254)", () => {
  const catalogue = [channel("one"), channel("two"), channel("three"), channel("four")];
  const resolve = (url: string): Channel | null => catalogue.find((entry) => entry.url === url) ?? null;
  const saved: MultiLayout = {
    channels: [catalogue[0]!, catalogue[1]!, null, catalogue[3]!],
    active: 1,
    resumedUrl: catalogue[1]!.url,
  };

  it("возвращает прошлую сетку, если текущий канал не менялся", () => {
    const plan = entryPlan(saved, catalogue[1]!, resolve);
    expect(plan.channels).toEqual([catalogue[0], catalogue[1], null, catalogue[3]]);
    expect(plan.active).toBe(1);
    expect(plan.resumedUrl).toBe(catalogue[1]!.url);
  });
  it("после смены канала вне сетки начинает заново с него одного", () => {
    const plan = entryPlan(saved, catalogue[2]!, resolve);
    expect(plan.channels).toEqual([catalogue[2], null, null, null]);
    expect(plan.active).toBe(0);
  });
  it("без прошлой раскладки — одна строка с текущим каналом", () => {
    expect(entryPlan(null, catalogue[0]!, resolve).channels).toEqual([catalogue[0], null, null, null]);
    expect(entryPlan(saved, null, resolve).channels).toEqual([null, null, null, null]);
  });
  it("исчезнувший из плейлиста канал даёт пустое окно", () => {
    const gone = channel("gone");
    const stale: MultiLayout = { channels: [catalogue[0]!, gone, null, null], active: 1, resumedUrl: gone.url };
    const plan = entryPlan(stale, catalogue[0]!, resolve);
    expect(plan.channels).toEqual([catalogue[0], null, null, null]);
    // Активное окно исчезло — звук переходит к первому заполненному.
    expect(plan.active).toBe(0);
    expect(plan.resumedUrl).toBe(catalogue[0]!.url);
  });
  it("когда не осталось ни одного канала — одиночная строка", () => {
    const stale: MultiLayout = { channels: [channel("gone"), null, null, null], active: 0, resumedUrl: null };
    const plan = entryPlan(stale, catalogue[2]!, resolve);
    expect(plan.channels).toEqual([catalogue[2], null, null, null]);
    expect(plan.active).toBe(0);
  });

  it("close запоминает раскладку, повторный close её не затирает", () => {
    const { model } = setup();
    model.start(catalogue[0]!, 1);
    model.select(1);
    model.play(catalogue[1]!);
    model.select(3);
    model.play(catalogue[3]!);
    model.close();
    expect(model.lastLayout?.channels).toEqual([catalogue[0], catalogue[1], null, catalogue[3]]);
    expect(model.lastLayout?.active).toBe(3);
    expect(model.lastLayout?.resumedUrl).toBe(catalogue[3]!.url);
    // Повторный close (уже закрыто) не должен затирать память пустой сеткой.
    expect(model.close()).toBeNull();
    expect(model.lastLayout?.channels).toEqual([catalogue[0], catalogue[1], null, catalogue[3]]);
  });
  it("lastLayout — копия: внешняя правка не ломает память модели", () => {
    const { model } = setup();
    model.start(catalogue[0]!, 1);
    model.close();
    const layout = model.lastLayout!;
    layout.channels[0] = null;
    layout.active = 2;
    expect(model.lastLayout?.channels[0]).toEqual(catalogue[0]);
    expect(model.lastLayout?.active).toBe(0);
  });
  it("forgetLayout забывает прошлую сетку (смена плейлиста)", () => {
    const { model } = setup();
    model.start(catalogue[0]!, 1);
    model.close();
    expect(model.lastLayout).not.toBeNull();
    model.forgetLayout();
    expect(model.lastLayout).toBeNull();
  });
  it("startLayout играет все заполненные окна и возвращает первый отказ", () => {
    type MockPlayer = MultiPlayer & {
      play: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      setVolume: ReturnType<typeof vi.fn>;
      togglePause: ReturnType<typeof vi.fn>;
    };
    const players: MockPlayer[] = [];
    const model = createMultiView(() => {
      const index = players.length;
      const player: MockPlayer = {
        play: vi.fn(() => (index === 2 ? "unsupported" : null)),
        stop: vi.fn(),
        setVolume: vi.fn(),
        togglePause: vi.fn(),
      };
      players.push(player);
      return player;
    });
    const layout: MultiLayout = { channels: [catalogue[0]!, catalogue[1]!, catalogue[2]!, null], active: 1, resumedUrl: catalogue[1]!.url };
    expect(model.startLayout(layout, 0.4)).toBe("unsupported");
    expect(players).toHaveLength(4);
    expect(players[0]!.play).toHaveBeenCalledWith(catalogue[0]);
    expect(players[1]!.play).toHaveBeenCalledWith(catalogue[1]);
    expect(players[2]!.play).toHaveBeenCalledWith(catalogue[2]);
    expect(players[3]!.play).not.toHaveBeenCalled();
    expect(players.map((player) => player.setVolume.mock.lastCall?.[0])).toEqual([0, 0.4, 0, 0]);
    expect(model.activeSlot).toBe(1);
    expect(model.channel).toEqual(catalogue[1]);
  });
});
