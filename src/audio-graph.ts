/** Нативная громкость до 100%; усиление доступно только при явном разрешении. */
export function volumePlan(value: number, boost: boolean) {
  const volume = Number.isFinite(value) ? Math.max(0, Math.min(boost ? 2 : 1, value)) : 1;
  return { volume, native: Math.min(1, volume), gain: Math.max(1, volume) };
}

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };

/** Общий ленивый контекст: обратимое усиление HLS и прежний путь аудио записи. */
export function createAudioGraph(video: HTMLVideoElement) {
  let context: AudioContext | null = null;
  let recordingSource: MediaElementAudioSourceNode | null = null;
  let boostStream: MediaStream | null = null;
  let boostSource: MediaStreamAudioSourceNode | null = null;
  let gain: GainNode | null = null;

  function ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    context ??= new AudioContext();
    void context.resume().catch(() => undefined);
    return context;
  }
  function teardown(): void {
    if (recordingSource && gain) {
      recordingSource.disconnect(gain);
      recordingSource.connect(context!.destination);
    }
    boostSource?.disconnect();
    gain?.disconnect();
    for (const track of boostStream?.getTracks() ?? []) track.stop();
    boostSource = null;
    gain = null;
    boostStream = null;
  }
  function volume(value: number, muted: boolean, boost: boolean): boolean {
    const plan = volumePlan(value, boost);
    if (plan.gain <= 1) {
      teardown();
      video.volume = plan.native;
      return true;
    }
    try {
      const ctx = ensure();
      if (!ctx) return false;
      if (!gain) {
        if (!recordingSource) {
          const element = video as CapturableVideo;
          const capture = element.captureStream ?? element.mozCaptureStream;
          if (!capture) return false;
          boostStream = capture.call(element);
          const audio = boostStream.getAudioTracks();
          if (!audio.length || audio.every((track) => track.muted)) { teardown(); return false; }
          boostSource = ctx.createMediaStreamSource(boostStream);
        }
        gain = ctx.createGain();
        recordingSource?.disconnect(ctx.destination);
        (recordingSource ?? boostSource!).connect(gain);
        gain.connect(ctx.destination);
      }
      gain!.gain.value = muted ? 0 : plan.gain;
      // Захваченная аудиодорожка не зависит от volume/muted элемента.
      video.volume = 0;
      return true;
    } catch {
      teardown();
      video.volume = 1;
      return false;
    }
  }
  function capture(): { track: MediaStreamTrack; release: () => void } | null {
    try {
      const ctx = ensure();
      if (!ctx) return null;
      if (!boostSource && !recordingSource) {
        recordingSource = ctx.createMediaElementSource(video);
        recordingSource.connect(ctx.destination);
      }
      const source = boostSource ?? recordingSource!;
      const dest = ctx.createMediaStreamDestination();
      source.connect(dest);
      const [track] = dest.stream.getAudioTracks();
      if (!track) { source.disconnect(dest); return null; }
      return { track, release: () => { try { source.disconnect(dest); } catch { /* граф уже отключён */ } track.stop(); } };
    } catch { return null; }
  }
  return { volume, capture, teardown };
}
