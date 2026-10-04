/**
 * Ключи localStorage, привязанные к плейлисту (#374):
 * `iptv-hub.<name>.v1:<playlist-id>`. Имена и версии — контракт хранилища
 * и backup JSON v2, менять их нельзя; модуль только убирает повтор шаблона.
 */
export function playlistScopedKey(name: string, playlistId: string): string {
  return `iptv-hub.${name}.v1:${playlistId}`;
}
