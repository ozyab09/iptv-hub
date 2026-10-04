import { localKey, looksLikeM3U, type LocalFs } from "./local-playlist";
import type { Backup } from "./backup";

export type LocalPlaylistFiles = Record<string, { m3u: string; epg: string | null }>;
type Playlists = Backup["playlists"];
type FsProvider = () => Promise<LocalFs> | null;

export function parseLocalPlaylistFiles(raw: unknown, playlists: Playlists): { files: LocalPlaylistFiles; warnings: string[] } {
  const warnings: string[] = [];
  const entries: [string, { m3u: string; epg: string | null }][] = [];
  if (raw === undefined) return { files: {}, warnings };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { files: {}, warnings: ["localPlaylists"] };
  const localIds = new Set(playlists.filter((p) => p.playlistUrl.startsWith("local:")).map((p) => p.id));
  for (const [id, value] of Object.entries(raw)) {
    if (!localIds.has(id) || !value || typeof value !== "object" || Array.isArray(value)) { warnings.push(`localPlaylists:${id}`); continue; }
    const file = value as Record<string, unknown>;
    if (typeof file.m3u !== "string" || !looksLikeM3U(file.m3u)) { warnings.push(`localPlaylists:${id}`); continue; }
    if (file.epg !== undefined && file.epg !== null && typeof file.epg !== "string") warnings.push(`localPlaylists:${id}`);
    entries.push([id, { m3u: file.m3u, epg: typeof file.epg === "string" ? file.epg : null }]);
  }
  return { files: Object.fromEntries(entries), warnings };
}

export function missingLocalFiles(backup: Pick<Backup, "playlists" | "localPlaylists">): string[] {
  return backup.playlists.filter((p) => p.playlistUrl.startsWith("local:") && !Object.hasOwn(backup.localPlaylists ?? {}, p.id)).map((p) => p.id);
}

/** Read only files owned by the exported local playlists; missing files remain explicit. */
export async function readLocalPlaylistFiles(playlists: Playlists, getFs: FsProvider): Promise<{ files: LocalPlaylistFiles; missing: string[] }> {
  const locals = playlists.filter((p) => p.playlistUrl.startsWith("local:"));
  if (!locals.length) return { files: {}, missing: [] };
  let fs: LocalFs | null;
  try { fs = await getFs(); } catch { fs = null; }
  if (!fs) return { files: {}, missing: locals.map((p) => p.id) };
  const entries: [string, { m3u: string; epg: string | null }][] = [];
  const missing: string[] = [];
  for (const p of locals) {
    try {
      const m3u = await fs.read(localKey(p.id));
      if (m3u === null || !looksLikeM3U(m3u)) { missing.push(p.id); continue; }
      entries.push([p.id, { m3u, epg: await fs.read(`${localKey(p.id)}:epg`) }]);
    } catch { missing.push(p.id); }
  }
  return { files: Object.fromEntries(entries), missing };
}

/** Restore OPFS before settings; roll back touched files if either storage rejects the import. */
export async function restoreLocalPlaylistFiles(backup: Backup, getFs: FsProvider, applySettings: () => void): Promise<void> {
  const { files } = parseLocalPlaylistFiles(backup.localPlaylists, backup.playlists);
  if (!Object.keys(files).length) { applySettings(); return; }
  const fs = await getFs();
  if (!fs) throw new Error("OPFS unavailable");
  const previous = new Map<string, string | null>();
  for (const id of Object.keys(files)) {
    for (const key of [localKey(id), `${localKey(id)}:epg`]) previous.set(key, await fs.read(key));
  }
  const write = (key: string, value: string | null) => value === null ? fs.remove(key) : fs.write(key, value);
  try {
    for (const [id, file] of Object.entries(files)) {
      await fs.write(localKey(id), file.m3u);
      await write(`${localKey(id)}:epg`, file.epg);
    }
    applySettings();
  } catch (error) {
    for (const [key, value] of previous) { try { await write(key, value); } catch { /* Storage itself is unavailable. */ } }
    throw error;
  }
}
