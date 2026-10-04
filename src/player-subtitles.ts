/**
 * Внешние субтитры (.srt/.vtt) поверх <video> (#389, вынесено в #376):
 * одна текстовая дорожка на элемент, переиспользуется между файлами.
 */
import { subtitleCueText, type SubtitleCue } from "./external-subtitles";

export class ExternalSubtitles {
  private track: TextTrack | null = null;
  private name: string | null = null;

  constructor(private video: HTMLVideoElement) {}

  /** Загрузить реплики; вызывающий отключает встроенные субтитры при enabled. */
  load(cues: readonly SubtitleCue[], name: string): void {
    this.clear();
    const track = this.track ??= this.video.addTextTrack("subtitles", "External");
    this.name = name;
    for (const cue of cues) track.addCue(new VTTCue(cue.start, cue.end, subtitleCueText(cue.text)));
  }

  setEnabled(enabled: boolean): void {
    if (this.track) this.track.mode = enabled ? "showing" : "disabled";
  }

  get info(): { name: string; enabled: boolean } | null {
    return this.name ? { name: this.name, enabled: this.track?.mode === "showing" } : null;
  }

  clear(): void {
    this.name = null;
    if (!this.track) return;
    this.track.mode = "hidden";
    for (const cue of Array.from(this.track.cues ?? [])) this.track.removeCue(cue);
    this.track.mode = "disabled";
  }
}
