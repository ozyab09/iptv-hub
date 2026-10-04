export interface SubtitleCue { start: number; end: number; text: string }
export interface SubtitlePreference { name: string; enabled: boolean }
export const subtitlePreferenceKey = (id: string): string => `iptv-hub.recording-subtitles.v1:${id}`;

/** SRT/WebVTT → текстовые cues; DOM и сеть не нужны. */
export function parseExternalSubtitles(input: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const time = (value: string): number | null => {
    const match = value.match(/^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/);
    if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return null;
    return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
  };
  for (const block of input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    const lines = block.trim().split("\n");
    if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0] ?? "")) continue;
    const index = lines.findIndex((line) => line.includes("-->"));
    if (index < 0) continue;
    const match = lines[index]!.match(/^(\S+)\s+-->\s+(\S+)(?:\s.*)?$/);
    if (!match) continue;
    const start = time(match[1]!);
    const end = time(match[2]!);
    const text = lines.slice(index + 1).join("\n").trim();
    if (start !== null && end !== null && end > start && text) cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** VTTCue разбирает разметку: экранируем её, чтобы показывать исходный текст. */
export function subtitleCueText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function parseSubtitlePreference(raw: string | null): SubtitlePreference | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (value && typeof value === "object" && "name" in value && typeof value.name === "string" && value.name &&
      "enabled" in value && typeof value.enabled === "boolean") return { name: value.name, enabled: value.enabled };
  } catch { /* Нет сохранённого выбора. */ }
  return null;
}
