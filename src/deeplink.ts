/**
 * Диплинк на канал (FR-12): разбор и применение ?ch=<url>.
 * Чистая логика без DOM: поиск канала по URL в плейлисте.
 */

/** Результат применения диплинка. */
export type DeepLinkResult =
  | { found: true; url: string }
  | { found: false };

/**
 * Найти канал по URL из ?ch=; URL без схемы/не http(s) не считается диплинком.
 */
export function resolveChannelDeepLink(
  channels: { url: string }[],
  chParam: string | null,
): DeepLinkResult {
  const url = chParam?.trim() ?? "";
  if (!url || !/^https?:\/\//.test(url)) return { found: false };
  const hit = channels.find((c) => c.url === url);
  return hit ? { found: true, url: hit.url } : { found: false };
}
