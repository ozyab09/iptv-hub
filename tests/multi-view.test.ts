import { describe, expect, it, vi } from "vitest";
import { createMultiView, type MultiPlayer } from "../src/multi-view";
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
