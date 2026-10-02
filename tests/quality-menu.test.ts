/**
 * Тесты UI-модуля меню качества/дорожек (issue #123, срез 2).
 * DOM-узлы — минимальные заглушки с нужной поверхностью; модуль получает
 * их через create, поэтому node-тесты возможны без jsdom.
 */
import { describe, it, expect } from "vitest";
import {
  createQualityMenu,
  type HlsLike,
  type QualityMenuNodes,
  type QualityPlayerAdapter,
} from "../src/quality-menu";

/** Минимальный DOM-узел: то, что модуль реально трогает. */
function el(tag: "button" | "div" | "span" = "div"): HTMLButtonElement {
  const listeners: Record<string, (() => void)[]> = {};    const e = {
    tagName: tag.toUpperCase(),
    hidden: false,
    textContent: "",
    title: "",
    disabled: false,
    className: "",
    children: [] as HTMLButtonElement[],
    attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) {
      e.attrs[k] = v;
    },
    addEventListener(type: string, fn: () => void) {
      (listeners[type] ??= []).push(fn);
    },
    append(...nodes: HTMLButtonElement[]) {
      e.children.push(...nodes);
    },
    click() {
      for (const fn of listeners["click"] ?? []) fn();
    },
  };
  return e as unknown as HTMLButtonElement;
}

function makeNodes(): QualityMenuNodes {
  return {
    qualityWrap: el(),
    qualityBtn: el("button"),
    qualityMenu: el(),
    audioWrap: el(),
    audioBtn: el("button"),
    audioMenu: el(),
    subtitleWrap: el(),
    subtitleBtn: el("button"),
    subtitleMenu: el(),
    playerStatus: el(),
  };
}

const hls: HlsLike = {
  levels: [
    { height: 1080, bitrate: 4_500_000 },
    { height: 720, bitrate: 2_000_000 },
    { height: 480, bitrate: 900_000 },
  ],
  currentLevel: 1,
  autoLevelEnabled: true,
  audioTracks: [
    { name: "Русский", lang: "ru" },
    { name: "English", lang: "en" },
  ],
  audioTrack: 0,
  subtitleTracks: [{ name: "Русские", lang: "ru" }],
  subtitleTrack: -1,
};

function makePlayer(h: HlsLike | null): QualityPlayerAdapter & { setLevelCalls: number[] } {
  const setLevelCalls: number[] = [];
  return {
    getHls: () => h,
    setLevel: (i) => setLevelCalls.push(i),
    setAudioTrack: () => undefined,
    setSubtitleTrack: () => undefined,
    setLevelCalls,
  };
}

function makeUi(h: HlsLike | null, isRecordingPlayback = () => false) {
  const nodes = makeNodes();
  const player = makePlayer(h);
  const ui = createQualityMenu({
    player,
    nodes,
    isRecordingPlayback,
    videoSize: () => ({ width: 1920, height: 1080 }),
    createButton: () => el("button"),
  });
  return { ui, nodes, player };
}

describe("createQualityMenu: hls есть", () => {
  it("не включает качество записи после событий HLS и восстанавливает его для эфира", () => {
    let recording = false;
    const { ui, nodes, player } = makeUi(hls, () => recording);
    ui.refreshQualityUi();
    const staleItem = nodes.qualityMenu.children[1] as HTMLButtonElement;
    recording = true;
    nodes.qualityMenu.hidden = false;
    ui.refreshQualityUi();
    expect(nodes.qualityBtn.disabled).toBe(true);
    expect((nodes.qualityBtn as unknown as { attrs: Record<string, string> }).attrs["aria-disabled"]).toBe("true");
    expect(nodes.qualityMenu.hidden).toBe(true);
    staleItem.click();
    expect(player.setLevelCalls).toEqual([]);
    recording = false;
    ui.refreshQualityUi();
    expect(nodes.qualityBtn.disabled).toBe(false);
    expect((nodes.qualityBtn as unknown as { attrs: Record<string, string> }).attrs["aria-disabled"]).toBe("false");
  });
  it("кнопка активна, лейбл Auto с текущим тиром", () => {
    const { ui, nodes } = makeUi(hls);
    ui.refreshQualityUi();
    expect(nodes.qualityBtn.disabled).toBe(false);
    expect(nodes.qualityBtn.textContent).toBe("Auto · HD");
  });

  it("меню качества: Auto + уровни по убыванию высоты", () => {
    const { ui, nodes } = makeUi(hls);
    ui.refreshQualityUi();
    const items = nodes.qualityMenu.children as unknown as HTMLButtonElement[];
    expect(items).toHaveLength(4);
    expect(items[0]!.textContent).toBe("Auto · HD");
    expect(items[1]!.textContent).toContain("1080p");
    expect(items[3]!.textContent).toContain("480p");
  });

  it("клик по уровню вызывает setLevel и закрывает меню", () => {
    const { ui, nodes, player } = makeUi(hls);
    ui.refreshQualityUi();
    const items = nodes.qualityMenu.children as unknown as HTMLButtonElement[];
    items[1]!.click();
    expect(player.setLevelCalls).toEqual([0]); // 1080p — индекс 0 в hls.levels
    expect(nodes.qualityMenu.hidden).toBe(true);
  });

  it("аудиодорожки видны при ≥2, лейбл на кнопке", () => {
    const { ui, nodes } = makeUi(hls);
    ui.refreshQualityUi();
    expect(nodes.audioWrap.hidden).toBe(false);
    const items = nodes.audioMenu.children as unknown as HTMLButtonElement[];
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Русский");
    expect(nodes.audioBtn.title).toContain("Русский");
  });

  it("одна аудиодорожка — кнопка скрыта", () => {
    const { ui, nodes } = makeUi({ ...hls, audioTracks: [{ name: "Русский" }] });
    ui.refreshQualityUi();
    expect(nodes.audioWrap.hidden).toBe(true);
  });

  it("субтитры: первый пункт «Выключены», активен при subtitleTrack=-1", () => {
    const { ui, nodes } = makeUi(hls);
    ui.refreshQualityUi();
    expect(nodes.subtitleWrap.hidden).toBe(false);
    const items = nodes.subtitleMenu.children as unknown as HTMLButtonElement[];
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toBe("Выключены");
    expect(items[0]!.className).toContain("on");
  });

  it("статус-бар: разрешение + битрейт текущего уровня", () => {
    const { ui, nodes } = makeUi(hls);
    ui.refreshPlayerStatus();
    expect(nodes.playerStatus.textContent).toContain("1920");
    expect(nodes.playerStatus.textContent).toContain("2"); // 2 Мбит/с
  });
});

describe("createQualityMenu: нативный playback (hls=null)", () => {
  it("кнопка качества задизейблена, дорожки скрыты, статус с прочерком", () => {
    const { ui, nodes } = makeUi(null);
    ui.refreshQualityUi();
    expect(nodes.qualityBtn.disabled).toBe(true);
    expect(nodes.qualityBtn.textContent).toBe("Auto");
    expect(nodes.qualityMenu.hidden).toBe(true);
    expect(nodes.audioWrap.hidden).toBe(true);
    expect(nodes.subtitleWrap.hidden).toBe(true);
    expect(nodes.playerStatus.textContent).toContain("1920");
    expect(nodes.playerStatus.textContent).toContain("—");
  });

  it("refreshPlayerStatus без hls не трогает статус", () => {
    const { ui, nodes } = makeUi(null);
    ui.refreshQualityUi(); // ставит «1920×1080 · —»
    const before = nodes.playerStatus.textContent;
    ui.refreshPlayerStatus();
    expect(nodes.playerStatus.textContent).toBe(before);
  });
});
