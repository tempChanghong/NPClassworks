import assert from "node:assert/strict";
import test from "node:test";
import {microphoneProcessingSettings, summarizeMicrophoneComparison, testMicrophoneInput} from "../src/utils/microphoneDeviceSettings.js";

test("comparison uses signal energy and does not confuse digital silence with missing samples", () => {
  const result = summarizeMicrophoneComparison([0.001, 0.001], [0.01, 0.01]);
  assert.equal(result.quietDbfs, -60);
  assert.equal(result.speechDbfs, -40);
  assert.equal(result.changeDb, 20);
  assert.equal(summarizeMicrophoneComparison([0], [0]).changeDb, 0);
  assert.equal(summarizeMicrophoneComparison([], [0.01]).changeDb, null);
  assert.equal(summarizeMicrophoneComparison([NaN], [0.01]).changeDb, null);
  assert.ok(summarizeMicrophoneComparison([0.001], [0.001, 0.1]).speechDbfs > -24);
});

test("audio processing settings distinguish reported false from unknown", () => {
  assert.deepEqual(microphoneProcessingSettings({autoGainControl: false, noiseSuppression: true}), {
    autoGainControl: false, noiseSuppression: true, echoCancellation: null,
  });
  assert.equal(microphoneProcessingSettings().autoGainControl, null);
});

test("two-phase acquisition requests raw audio, reports actual settings and releases resources", async t => {
  const originals = new Map();
  let phase, stopped = 0, closed = 0, disconnected = 0, requestedAudio;
  const waits = [];
  const track = {
    stop() { stopped++; }, label: "Test conference microphone",
    getSettings: () => ({deviceId: "physical-input", autoGainControl: true, noiseSuppression: false}),
  };
  const browser = {
    DOMException: globalThis.DOMException,
    setTimeout(resolve, ms) { waits.push(ms); resolve(); },
    AudioContext: class {
      state = "running";
      createAnalyser() { return {fftSize: 1024, getFloatTimeDomainData(buffer) { buffer.fill(phase === "quiet" ? 0.001 : 0.01); }}; }
      createMediaStreamSource() { return {connect() {}, disconnect() { disconnected++; }}; }
      async close() { closed++; }
    },
  };
  for (const [key, value] of Object.entries({window: browser, navigator: {mediaDevices: {
    async getUserMedia({audio}) {
      requestedAudio = audio;
      return {getTracks: () => [track], getAudioTracks: () => [track]};
    },
  }}})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {value, configurable: true});
  }
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const phases = [];
  const result = await testMicrophoneInput("chosen", {diagnostic: true, intervalMs: 100,
    onPhase(value) { phase = value; phases.push(value); }});
  assert.deepEqual(phases, ["quiet", "speech"]);
  assert.equal(waits.reduce((sum, ms) => sum + ms, 0), 10000);
  assert.deepEqual(requestedAudio, {echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, deviceId: {exact: "chosen"}});
  assert.equal(result.deviceId, "physical-input");
  assert.equal(result.processing.autoGainControl, true, "report actual settings, not requested constraints");
  assert.equal(result.processing.echoCancellation, null);
  assert.ok(Math.abs(result.comparison.changeDb - 20) < 0.01);
  assert.equal(result.clippedRatio, 0);
  assert.equal(stopped, 1); assert.equal(closed, 1); assert.equal(disconnected, 1);

  const controller = new AbortController();
  await assert.rejects(testMicrophoneInput("chosen", {diagnostic: true, intervalMs: 100, signal: controller.signal,
    onPhase(value) { if (value === "speech") controller.abort(); }}), {name: "AbortError"});
  assert.ok(stopped >= 2); assert.ok(closed >= 2); assert.equal(disconnected, 2);
});
