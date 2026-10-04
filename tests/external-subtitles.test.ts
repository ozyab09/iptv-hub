import { describe, expect, it } from "vitest";
import { parseExternalSubtitles, parseSubtitlePreference, subtitleCueText, subtitlePreferenceKey } from "../src/external-subtitles";

describe("local subtitles", () => {
  it("parses SRT with BOM, CRLF, comma milliseconds and multiline text", () => {
    expect(parseExternalSubtitles("\uFEFF1\r\n00:01:02,345 --> 00:01:04,678\r\nFirst line\r\n<b>Second line</b>\r\n\r\n2\r\n00:00:00,000 --> 00:00:01,000\r\nEarlier\r\n"))
      .toEqual([{ start: 0, end: 1, text: "Earlier" }, { start: 62.345, end: 64.678, text: "First line\n<b>Second line</b>" }]);
  });
  it("parses WebVTT identifiers, short timestamps and ignores comments/styles", () => {
    expect(parseExternalSubtitles("WEBVTT\n\nNOTE comment\n00:00:00.000 --> 00:00:01.000\nnot a cue\n\nSTYLE\n::cue {color:red}\n\nidentifier\n01:02.345 --> 01:04.678 align:start\nHello\n"))
      .toEqual([{ start: 62.345, end: 64.678, text: "Hello" }]);
  });
  it("skips empty, malformed, reversed and out-of-range cues", () => {
    for (const value of ["", "not subtitles", "00:00:03,000 --> 00:00:02,000\nwrong", "00:60:00,000 --> 01:00:02,000\nwrong", "00:00:00,000 --> 00:00:01,000\n"]) {
      expect(parseExternalSubtitles(value)).toEqual([]);
    }
  });
  it("renders HTML-like text literally, including ampersands", () => {
    expect(subtitleCueText('<b>A & B</b>')).toBe("&lt;b&gt;A &amp; B&lt;/b&gt;");
  });
  it("stores only filename and enabled preference under the recording id", () => {
    expect(subtitlePreferenceKey("a")).not.toBe(subtitlePreferenceKey("b"));
    expect(parseSubtitlePreference('{"name":"local.srt","enabled":false,"cues":"private"}')).toEqual({ name: "local.srt", enabled: false });
    for (const raw of [null, "{", "null", '{"name":"x"}', '{"name":"","enabled":true}']) expect(parseSubtitlePreference(raw)).toBeNull();
  });
});
