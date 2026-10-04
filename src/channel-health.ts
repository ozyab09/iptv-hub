export type FailureKind = "unknown" | "http" | "blocked" | "mixed-content";
export interface ChannelFailure { failedAt: number; kind: FailureKind; status?: number }
export type ChannelHealth = ReadonlyMap<string, ChannelFailure>;
export const channelHealthKey = (id: string): string => `iptv-hub.channel-health.v1:${id}`;

/** Audio needs actual playback; a known video track still needs decoded frames. */
export function isChannelRecovered(media: { readyState: number; videoWidth: number; error: unknown }, event: string, hasVideo: boolean): boolean {
  if (media.readyState < 2 || media.error) return false;
  return media.videoWidth > 0 || (!hasVideo && event === "playing");
}

export function parseChannelHealth(raw: string | null): ChannelHealth {
  const result = new Map<string, ChannelFailure>();
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 || !("failures" in data) || !Array.isArray(data.failures)) return result;
    for (const item of data.failures) {
      if (!item || typeof item !== "object" || typeof item.url !== "string" || !/^https?:\/\//.test(item.url) ||
        !Number.isFinite(item.failedAt) || item.failedAt <= 0 || !["unknown", "http", "blocked", "mixed-content"].includes(item.kind)) continue;
      const failure: ChannelFailure = { failedAt: item.failedAt, kind: item.kind };
      if (failure.kind === "http" && Number.isInteger(item.status) && item.status >= 100 && item.status <= 599) failure.status = item.status;
      result.set(item.url, failure);
    }
  } catch { /* Повреждённые данные не мешают воспроизведению. */ }
  return result;
}

export function serializeChannelHealth(health: ChannelHealth): string {
  return JSON.stringify({ version: 1, failures: [...health].map(([url, failure]) => ({ url, ...failure })) });
}

export function markChannelFailure(health: ChannelHealth, url: string, failure: ChannelFailure): ChannelHealth {
  return new Map(health).set(url, { ...failure });
}

export function clearChannelFailure(health: ChannelHealth, url: string): ChannelHealth {
  if (!health.has(url)) return health;
  const next = new Map(health);
  next.delete(url);
  return next;
}
