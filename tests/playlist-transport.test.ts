/**
 * Тесты транспорта загрузки плейлистов (срез 4 #123): OPFS-адаптер,
 * loadPlaylist (local:/http) и подсказки сетевых сбоев. Всё на фейках —
 * node-окружение, без DOM и сети.
 */
import { describe, expect, it, vi } from "vitest";
import { createOpfsFs, createTransport, type OpfsDirLike } from "../src/playlist-transport";
import type { LocalFs } from "../src/local-playlist";
import { t } from "../src/i18n";

/** Фейковый OPFS-каталог: файлы в Map, семантика write→close как в OPFS. */
function fakeDir(): { dir: OpfsDirLike; files: Map<string, string> } {
  const files = new Map<string, string>();
  const dir: OpfsDirLike = {
    async getFileHandle(key, options) {
      if (!files.has(key) && !options?.create) throw new Error("NotFoundError");
      return {
        async getFile() {
          return { text: async () => files.get(key) ?? "" };
        },
        async createWritable() {
          let pending: string | null = null;
          return {
            write: async (content) => {
              pending = content;
            },
            close: async () => {
              if (pending !== null) files.set(key, pending);
            },
          };
        },
      };
    },
    async removeEntry(key) {
      if (!files.has(key)) throw new Error("NotFoundError");
      files.delete(key);
    },
  };
  return { dir, files };
}

/** Простой фейковый LocalFs поверх Map (для local:-сценариев loadPlaylist). */
function fakeFs(): LocalFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: async (key) => files.get(key) ?? null,
    write: async (key, content) => void files.set(key, content),
    remove: async (key) => void files.delete(key),
  };
}

describe("createOpfsFs", () => {
  it("null без storage и без getDirectory", () => {
    expect(createOpfsFs(null)!()).toBeNull();
    expect(createOpfsFs(undefined)!()).toBeNull();
    expect(createOpfsFs({})!()).toBeNull();
  });

  it("каталог запрашивается один раз, промис кешируется", async () => {
    const { dir } = fakeDir();
    const getDirectory = vi.fn(async () => dir);
    const provider = createOpfsFs({ getDirectory });
    const first = provider();
    const second = provider();
    expect(first).toBe(second);
    expect(await first).toBeDefined();
    expect(getDirectory).toHaveBeenCalledTimes(1);
  });

  it("read: существующий файл и null для отсутствующего", async () => {
    const { dir, files } = fakeDir();
    files.set("local:abc", "#EXTM3U");
    const fs = await createOpfsFs({ getDirectory: async () => dir })!();
    expect(await fs!.read("local:abc")).toBe("#EXTM3U");
    expect(await fs!.read("local:nope")).toBeNull();
  });

  it("write сохраняет после close", async () => {
    const { dir, files } = fakeDir();
    const fs = await createOpfsFs({ getDirectory: async () => dir })!();
    await fs!.write("local:x", "данные");
    expect(files.get("local:x")).toBe("данные");
  });

  it("remove удаляет и не падает на повторном", async () => {
    const { dir, files } = fakeDir();
    files.set("local:x", "данные");
    const fs = await createOpfsFs({ getDirectory: async () => dir })!();
    await fs!.remove("local:x");
    expect(files.has("local:x")).toBe(false);
    await expect(fs!.remove("local:x")).resolves.toBeUndefined();
  });
});

describe("createTransport: loadPlaylist", () => {
  const M3U = '#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="Тест",Канал 1\nhttps://fixture.test/1.mp4\n';

  it("http(s): fetch + parseM3U", async () => {
    const doFetch = vi.fn(async () => new Response(M3U, { status: 200 }));
    const transport = createTransport({ fs: () => null, fetch: doFetch, language: () => "ru" });
    const snapshot = await transport.loadPlaylist("https://fixture.test/playlist.m3u");
    expect(doFetch).toHaveBeenCalledWith("https://fixture.test/playlist.m3u", { signal: expect.any(AbortSignal) });
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.channels[0]!.name).toBe("Канал 1");
  });

  it("http(s): не-2xx — переведённая ошибка со статусом", async () => {
    const transport = createTransport({
      fs: () => null,
      fetch: async () => new Response("nope", { status: 404 }),
      language: () => "ru",
    });
    await expect(transport.loadPlaylist("https://fixture.test/p.m3u"))
      .rejects.toThrow(t("error.httpPlaylist", "ru", { status: 404 }));
  });

  it("текст ошибки следует языку deps (en)", async () => {
    const transport = createTransport({
      fs: () => null,
      fetch: async () => new Response("nope", { status: 500 }),
      language: () => "en",
    });
    await expect(transport.loadPlaylist("https://fixture.test/p.m3u"))
      .rejects.toThrow(t("error.httpPlaylist", "en", { status: 500 }));
  });

  it("local: без OPFS — ошибка error.localOpfs, fetch не зовётся", async () => {
    const doFetch = vi.fn();
    const transport = createTransport({ fs: () => null, fetch: doFetch, language: () => "ru" });
    await expect(transport.loadPlaylist("local:abc"))
      .rejects.toThrow(t("error.localOpfs", "ru"));
    expect(doFetch).not.toHaveBeenCalled();
  });

  it("local: файл отсутствует — ошибка error.localMissing", async () => {
    const transport = createTransport({ fs: async () => fakeFs(), language: () => "ru" });
    await expect(transport.loadPlaylist("local:abc"))
      .rejects.toThrow(t("error.localMissing", "ru"));
  });

  it("local: читает содержимое из хранилища и разбирает M3U", async () => {
    const fs = fakeFs();
    fs.files.set("local:abc", M3U);
    const transport = createTransport({ fs: () => Promise.resolve(fs), language: () => "ru" });
    const snapshot = await transport.loadPlaylist("local:abc");
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.channels[0]!.url).toBe("https://fixture.test/1.mp4");
  });
});

describe("createTransport: describeFailure", () => {
  const HTTPS_PAGE = "https://ozyab09.github.io/iptv-hub/";

  it("точная причина плеера приоритетнее общей подсказки", () => {
    const transport = createTransport({
      fs: () => null,
      language: () => "ru",
      pageUrl: () => HTTPS_PAGE,
    });
    expect(transport.describeFailure("http://cdn.example.com/p.m3u", "смешанный контент")).toBe(
      "смешанный контент",
    );
  });

  it("http-ссылка на https-странице — подсказка о смешанном контенте", () => {
    const transport = createTransport({
      fs: () => null,
      language: () => "ru",
      pageUrl: () => HTTPS_PAGE,
    });
    expect(transport.describeFailure("http://cdn.example.com/p.m3u")).toBe(
      t("error.mixedHint", "ru"),
    );
  });

  it("https-ссылка на https-странице — подсказка про CORS", () => {
    const transport = createTransport({
      fs: () => null,
      language: () => "en",
      pageUrl: () => HTTPS_PAGE,
    });
    expect(transport.describeFailure("https://cdn.example.com/p.m3u")).toBe(
      t("error.corsHint", "en"),
    );
  });
});
