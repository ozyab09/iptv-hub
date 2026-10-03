/** Снимок Network Information API; отсутствие API не включает ограничение. */
export interface ConnectionInfo {
  type?: string;
  effectiveType?: string;
}

export function needsMobileQualityCap(enabled: boolean, connection: ConnectionInfo | null): boolean {
  if (!enabled || !connection) return false;
  if (connection.type === "wifi" || connection.type === "ethernet") return false;
  if (connection.type === "cellular") return true;
  return ["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "");
}

/** ABR cap ограничивает префикс уровней; если даже первый выше порога, берём его. */
export function mobileQualityCap(levels: ReadonlyArray<{ height: number }>, maxHeight: number): number {
  if (!levels.length) return -1;
  const firstAbove = levels.findIndex((level) => level.height > maxHeight);
  return firstAbove < 0 ? levels.length - 1 : Math.max(0, firstAbove - 1);
}
