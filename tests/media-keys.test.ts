import { describe, it, expect } from "vitest";
import { mediaKeyAction } from "../src/media-keys";

describe("медиа-клавиши: код → действие (#392)", () => {
  it("каждая медиа-клавиша даёт своё действие", () => {
    expect(mediaKeyAction("MediaPlay")).toBe("play");
    expect(mediaKeyAction("MediaPause")).toBe("pause");
    expect(mediaKeyAction("MediaPlayPause")).toBe("toggle");
    expect(mediaKeyAction("MediaFastForward")).toBe("forward");
    expect(mediaKeyAction("MediaRewind")).toBe("backward");
    expect(mediaKeyAction("MediaTrackNext")).toBe("next");
    expect(mediaKeyAction("MediaTrackPrevious")).toBe("previous");
  });

  it("обычные клавиши — не медиа-клавиши", () => {
    expect(mediaKeyAction("KeyA")).toBeNull();
    expect(mediaKeyAction("Space")).toBeNull();
    expect(mediaKeyAction("ArrowLeft")).toBeNull();
    expect(mediaKeyAction("Escape")).toBeNull();
    expect(mediaKeyAction("")).toBeNull();
  });

  it("регистр кода значим: это аппаратные коды, а не символы", () => {
    expect(mediaKeyAction("mediaplay")).toBeNull();
    expect(mediaKeyAction("MEDIAPLAY")).toBeNull();
    expect(mediaKeyAction("Media play")).toBeNull();
  });
});
