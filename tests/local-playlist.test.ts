import { describe, expect, it } from "vitest";
import {
  defaultLocalName,
  loadLocalPlaylist,
  localKey,
  looksLikeM3U,
  removeLocalPlaylist,
  saveLocalPlaylist,
  type LocalFs,
} from "../src/local-playlist";

/** Фейковый OPFS: карта ключ → строка. */
function fakeFs(): { fs: LocalFs; dump: () => Map<string, string> } {
  const map = new Map<string, string>();
  return {
    fs: {
      read: async (k) => map.get(k) ?? null,
      write: async (k, v) => void map.set(k, v),
      remove: async (k) => void map.delete(k),
    },
    dump: () => map,
  };
}

const M3U = "#EXTM3U\n#EXTINF:-1 tvg-id=\"a\",Канал А\nhttps://a/stream\n";

describe("local playlist (OPFS)", () => {
  it("save → load: содержимое читается по ключу local:<id>", async () => {
    const { fs, dump } = fakeFs();
    await saveLocalPlaylist(fs, "id1", M3U, null);
    expect(dump().has("local:id1")).toBe(true);
    expect(await loadLocalPlaylist(fs, "id1")).toBe(M3U);
  });

  it("EPG сохраняется отдельным ключом", async () => {
    const { fs, dump } = fakeFs();
    await saveLocalPlaylist(fs, "id1", M3U, "<tv></tv>");
    expect(dump().get("local:id1:epg")).toBe("<tv></tv>");
  });

  it("чтение несуществующего — null", async () => {
    const { fs } = fakeFs();
    expect(await loadLocalPlaylist(fs, "nope")).toBeNull();
  });

  it("remove удаляет и m3u, и epg", async () => {
    const { fs, dump } = fakeFs();
    await saveLocalPlaylist(fs, "id1", M3U, "<tv></tv>");
    await removeLocalPlaylist(fs, "id1");
    expect(dump().size).toBe(0);
  });

  it("looksLikeM3U: заголовок и EXTINF обязательны", () => {
    expect(looksLikeM3U(M3U)).toBe(true);
    expect(looksLikeM3U("#EXTM3U\n")).toBe(false);
    expect(looksLikeM3U("просто текст")).toBe(false);
  });

  it("defaultLocalName: чистит имя файла", () => {
    expect(defaultLocalName("моя подборка.m3u")).toBe("моя подборка");
    expect(defaultLocalName("list.m3u8")).toBe("list");
    expect(defaultLocalName(".m3u")).toBe("Локальный плейлист");
  });

  it("localKey стабилен", () => {
    expect(localKey("x")).toBe("local:x");
  });
});
