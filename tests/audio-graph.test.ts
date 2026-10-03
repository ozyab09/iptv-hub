import { afterEach, expect, it, vi } from "vitest";
import { createAudioGraph, volumePlan } from "../src/audio-graph";
import { sanitizePlayerSettings } from "../src/player-settings";

afterEach(() => vi.unstubAllGlobals());

it("splits native volume and gain, clamps limits and rejects non-finite values", () => {
  expect(volumePlan(1.5, true)).toEqual({ volume: 1.5, native: 1, gain: 1.5 });
  expect(volumePlan(3, true)).toEqual({ volume: 2, native: 1, gain: 2 });
  expect(volumePlan(2, false)).toEqual({ volume: 1, native: 1, gain: 1 });
  expect(volumePlan(-1, true)).toEqual({ volume: 0, native: 0, gain: 1 });
  expect(volumePlan(NaN, true)).toEqual({ volume: 1, native: 1, gain: 1 });
});

it("validates persisted volume against the explicitly enabled boost range", () => {
  expect(sanitizePlayerSettings({ volumeBoost: true, volumePercent: 150 }).volumePercent).toBe(150);
  for (const value of [150, -1, 201, 1.5, "50", NaN]) {
    expect(sanitizePlayerSettings({ volumePercent: value }).volumePercent).toBe(100);
  }
  expect(sanitizePlayerSettings({ volumeBoost: "true", volumePercent: 150 }).volumeBoost).toBe(false);
  expect(sanitizePlayerSettings({ volumePercent: 0 }).volumePercent).toBe(0);
});

function fixture() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = node();
  const gain = { ...node(), gain: { value: 1 } };
  const track = { stop: vi.fn() };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  const context = {
    resume: vi.fn(() => Promise.resolve()), destination: {},
    createMediaStreamSource: vi.fn(() => source), createMediaElementSource: vi.fn(() => source),
    createGain: vi.fn(() => gain), createMediaStreamDestination: vi.fn(() => ({ stream })),
  };
  const construct = vi.fn(function () { return context; });
  vi.stubGlobal("AudioContext", construct);
  const video = { volume: 1, captureStream: vi.fn(() => stream) };
  return { graph: createAudioGraph(video as unknown as HTMLVideoElement), video, source, gain, track, context, construct };
}

it("boosts and mutes through one graph, shares recording audio, and restores native output", () => {
  const { graph, video, source, gain, track, context, construct } = fixture();
  expect(graph.volume(0.5, false, true)).toBe(true);
  expect(construct).not.toHaveBeenCalled();
  expect(video.volume).toBe(0.5);
  expect(graph.volume(1.5, false, true)).toBe(true);
  expect(video.volume).toBe(0);
  expect(gain.gain.value).toBe(1.5);
  graph.volume(2, true, true);
  expect(gain.gain.value).toBe(0);
  graph.volume(2, false, true);
  expect(gain.gain.value).toBe(2);
  const recording = graph.capture()!;
  expect(recording.track).toBe(track);
  recording.release();
  expect(context.createMediaElementSource).not.toHaveBeenCalled();
  expect(construct).toHaveBeenCalledTimes(1);
  graph.volume(0.75, false, false);
  expect(video.volume).toBe(0.75);
  expect(source.disconnect).toHaveBeenCalled();
  expect(gain.disconnect).toHaveBeenCalled();
  expect(track.stop).toHaveBeenCalled();
});

it("reuses the element source across recording sessions and releases each output", () => {
  const { graph, context, construct } = fixture();
  graph.capture()!.release();
  graph.capture()!.release();
  expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
  expect(context.createMediaStreamDestination).toHaveBeenCalledTimes(2);
  expect(construct).toHaveBeenCalledTimes(1);
});

it("reuses an existing recording source for gain without duplicating native output", () => {
  const { graph, video, context, source, gain } = fixture();
  graph.capture()!.release();
  graph.volume(1.5, false, true);
  expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
  expect(video.captureStream).not.toHaveBeenCalled();
  expect(source.disconnect).toHaveBeenCalledWith(context.destination);
  expect(source.connect).toHaveBeenCalledWith(gain);
  graph.volume(1, false, false);
  expect(source.disconnect).toHaveBeenCalledWith(gain);
  expect(source.connect).toHaveBeenLastCalledWith(context.destination);
});

it("releases failed captures and allows another attempt", () => {
  const { graph, video, track } = fixture();
  video.captureStream.mockReturnValueOnce({ getAudioTracks: () => [], getTracks: () => [track] });
  expect(graph.volume(1.5, false, true)).toBe(false);
  expect(track.stop).toHaveBeenCalled();
  expect(graph.volume(1.5, false, true)).toBe(true);
});

it("rejects a muted captured track instead of routing protected audio to silence", () => {
  const { graph, video, track } = fixture();
  Object.assign(track, { muted: true });
  expect(graph.volume(1.5, false, true)).toBe(false);
  expect(video.volume).toBe(1);
  expect(track.stop).toHaveBeenCalled();
});

it("keeps native volume available without Web Audio or capturable audio", () => {
  const { graph, video } = fixture();
  vi.stubGlobal("AudioContext", undefined);
  expect(graph.volume(1.5, false, true)).toBe(false);
  expect(video.volume).toBe(1);
  expect(graph.capture()).toBeNull();
  expect(graph.volume(0.25, false, false)).toBe(true);
  expect(video.volume).toBe(0.25);
});
