import { describe, expect, it, vi } from "vitest";
import { buildBackup, parseBackup } from "../src/backup";
import { missingLocalFiles, parseLocalPlaylistFiles, readLocalPlaylistFiles, restoreLocalPlaylistFiles } from "../src/backup-local";
import type { LocalFs } from "../src/local-playlist";

const m3u = "#EXTM3U\n#EXTINF:-1,Local\nhttps://fixture.test/live.m3u8\n";
const local = { id: "file", name: "File", playlistUrl: "local:file", epgUrl: null };
const network = { id: "net", name: "Network", playlistUrl: "https://fixture.test/pl.m3u", epgUrl: null };
const input = { theme: "dark", playlists: [local, network], activeId: "file", favorites: {} };
function fsFixture() {
  const files = new Map<string, string>();
  const fs: LocalFs = {
    read: vi.fn(async (key) => files.get(key) ?? null),
    write: vi.fn(async (key, value) => { files.set(key, value); }),
    remove: vi.fn(async (key) => { files.delete(key); }),
  };
  return { files, fs };
}

describe("local playlist backup", () => {
  it("round trips M3U and optional EPG into clean OPFS before metadata", async () => {
    const source = fsFixture();
    source.files.set("local:file", m3u);
    source.files.set("local:file:epg", "<tv></tv>");
    source.files.set("recording.ts", "media excluded");
    const read = await readLocalPlaylistFiles(input.playlists, () => Promise.resolve(source.fs));
    expect(read.missing).toEqual([]);
    const result = parseBackup(JSON.stringify(buildBackup({ ...input, localPlaylists: read.files })));
    if (!result.ok) throw new Error(result.error);
    expect(result.warnings).toEqual([]);
    expect(missingLocalFiles(result.data)).toEqual([]);
    const target = fsFixture();
    const apply = vi.fn(() => expect(target.files.get("local:file")).toBe(m3u));
    await restoreLocalPlaylistFiles(result.data, () => Promise.resolve(target.fs), apply);
    expect(target.files).toEqual(new Map([["local:file", m3u], ["local:file:epg", "<tv></tv>"]]));
    expect(apply).toHaveBeenCalledOnce();
  });
  it.each([1, 2])("preserves local metadata in legacy v%s and reports missing content", (version) => {
    const result = parseBackup(JSON.stringify({ ...input, version, playlists: [{ ...local, playlistUrl: "local:old" }] }));
    if (!result.ok) throw new Error(result.error);
    expect(result.data.playlists).toEqual([local]);
    expect(missingLocalFiles(result.data)).toEqual(["file"]);
  });
  it("rejects unknown owners, network owners and malformed files with diagnostics", () => {
    const result = parseLocalPlaylistFiles({ unknown: { m3u }, net: { m3u }, file: { m3u: "invalid" } }, input.playlists);
    expect(result.files).toEqual({});
    expect(result.warnings).toEqual(["localPlaylists:unknown", "localPlaylists:net", "localPlaylists:file"]);
    expect(parseLocalPlaylistFiles([], input.playlists).warnings).toEqual(["localPlaylists"]);
    expect(parseLocalPlaylistFiles({ file: { m3u, epg: 42 } }, input.playlists)).toEqual({ files: { file: { m3u, epg: null } }, warnings: ["localPlaylists:file"] });
  });
  it("reports missing files or unavailable storage during export", async () => {
    const source = fsFixture();
    expect(await readLocalPlaylistFiles(input.playlists, () => null)).toEqual({ files: {}, missing: ["file"] });
    expect(await readLocalPlaylistFiles(input.playlists, () => Promise.reject(new Error("Denied")))).toEqual({ files: {}, missing: ["file"] });
    expect(await readLocalPlaylistFiles(input.playlists, () => Promise.resolve(source.fs))).toEqual({ files: {}, missing: ["file"] });
    source.files.set("local:file", "invalid");
    expect((await readLocalPlaylistFiles(input.playlists, () => Promise.resolve(source.fs))).missing).toEqual(["file"]);
    vi.mocked(source.fs.read).mockRejectedValueOnce(new Error("Read failed"));
    expect((await readLocalPlaylistFiles(input.playlists, () => Promise.resolve(source.fs))).missing).toEqual(["file"]);
  });
  it("does not access OPFS for network-only or legacy metadata imports", async () => {
    const provider = vi.fn(() => null);
    await readLocalPlaylistFiles([network], provider);
    const apply = vi.fn();
    await restoreLocalPlaylistFiles(buildBackup(input), provider, apply);
    expect(provider).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledOnce();
  });
  it("leaves metadata untouched when OPFS is unavailable", async () => {
    const apply = vi.fn();
    await expect(restoreLocalPlaylistFiles(buildBackup({ ...input, localPlaylists: { file: { m3u, epg: null } } }), () => null, apply)).rejects.toThrow("OPFS unavailable");
    expect(apply).not.toHaveBeenCalled();
  });
  it.each(["file", "settings"])("rolls back touched files on %s failure and preserves other files", async (failure) => {
    const target = fsFixture();
    target.files.set("local:file", "old content");
    target.files.set("local:file:epg", "old epg");
    target.files.set("local:other", "untouched");
    vi.mocked(target.fs.write).mockImplementationOnce(async (key, value) => {
      target.files.set(key, value);
      if (failure === "file") throw new Error("Quota");
    });
    const apply = vi.fn(() => { throw new Error("Settings quota"); });
    await expect(restoreLocalPlaylistFiles(buildBackup({ ...input, localPlaylists: { file: { m3u, epg: null } } }), () => Promise.resolve(target.fs), apply)).rejects.toThrow(/Quota|Settings quota/);
    expect(target.files).toEqual(new Map([["local:file", "old content"], ["local:file:epg", "old epg"], ["local:other", "untouched"]]));
    expect(apply).toHaveBeenCalledTimes(failure === "file" ? 0 : 1);
  });
  it("removes newly created files on failed import and stale EPG on successful import", async () => {
    const target = fsFixture();
    const backup = buildBackup({ ...input, localPlaylists: { file: { m3u, epg: null } } });
    await expect(restoreLocalPlaylistFiles(backup, () => Promise.resolve(target.fs), () => { throw new Error("Quota"); })).rejects.toThrow("Quota");
    expect(target.files.size).toBe(0);
    target.files.set("local:file:epg", "old epg");
    await restoreLocalPlaylistFiles(backup, () => Promise.resolve(target.fs), () => {});
    expect(target.files).toEqual(new Map([["local:file", m3u]]));
  });
});
