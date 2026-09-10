import assert from "node:assert/strict";
import test from "node:test";
import {createFlowHarness, eventually} from "./helpers/flowHarness.js";
import {saveMicrophoneDeviceSettings, microphoneDeviceSettingsKey} from "../src/utils/microphoneDeviceSettings.js";
import {saveNoiseScheduleSettings} from "../src/utils/noiseScheduleSettings.js";

for (const mode of ["scheduled", "manual", "idle"]) {
  test(`${mode}: saving a replacement microphone recovers once only when monitoring is wanted`, async t => {
    t.mock.timers.enable({apis: ["Date"], now: new Date("2026-09-10T12:00:00+08:00")});
    const h = await createFlowHarness();
    t.after(() => h.close());
    h.newStore({screen: true});
    saveMicrophoneDeviceSettings("screen-a", {deviceId: "missing"});
    saveNoiseScheduleSettings("screen-a", {enabled: mode === "scheduled", startTime: "00:00", endTime: "23:59"});
    const starts = [], tracks = [];
    const node = () => ({connect() {}, frequency: {}, gain: {}});
    window.isSecureContext = true;
    window.AudioContext = class {
      state = "running";
      audioWorklet = {addModule: async () => {}};
      createMediaStreamSource() { return node(); }
      createBiquadFilter() { return node(); }
      createGain() { return node(); }
      close() { return Promise.resolve(); }
    };
    window.AudioWorkletNode = class { constructor() { this.port = {}; } connect() {} };
    navigator.mediaDevices = {
      enumerateDevices: async () => [{kind: "audioinput", deviceId: "good", label: "正常麦克风"}],
      async getUserMedia({audio}) {
        const id = audio.deviceId.exact;
        starts.push(id);
        if (id !== "good") throw new globalThis.DOMException("Device missing", "NotFoundError");
        const track = Object.assign(new globalThis.EventTarget(), {stopped: false, stop() { this.stopped = true; }, getSettings: () => ({deviceId: id})});
        tracks.push(track);
        return {getTracks: () => [track], getAudioTracks: () => [track]};
      },
    };
    const manager = await h.openNoiseScheduler();
    let manualCard, manualEndsAt;
    if (mode === "manual") {
      manualCard = await h.openNoiseCard();
      await manualCard.state.startMonitoring();
      manualEndsAt = manualCard.state.manualEndsAt;
    }
    if (mode !== "idle") await eventually(() => assert.equal(manager.noiseService.status, "unavailable"));
    if (mode === "manual") t.mock.timers.setTime(Date.now() + 60 * 60 * 1000);
    const picker = await h.openComponent("/src/components/v2/MicrophoneDevicePicker.vue", {bindingId: "screen-a"});
    picker.state.selectedDeviceId.value = "good";
    await picker.state.saveSelection();
    if (mode === "idle") assert.deepEqual(starts, []);
    else {
      await eventually(() => assert.equal(manager.noiseService.status, "active"));
      assert.deepEqual(starts, ["missing", "good"], "picker and scheduler must not both start the new device");
      // A failed explicit switch from an active microphone must not cause another automatic attempt.
      picker.state.selectedDeviceId.value = "bad-again";
      await picker.state.saveSelection();
      await eventually(() => assert.equal(manager.noiseService.status, "unavailable"));
      await picker.state.saveSelection();
      for (let i = 0; i < 5; i++) window.dispatchEvent(new globalThis.Event("focus"));
      assert.deepEqual(starts, ["missing", "good", "bad-again"]);
      // Changes for a different binding do not wake this microphone.
      saveMicrophoneDeviceSettings("screen-other", {deviceId: "good"});
      assert.equal(starts.length, 3);
      // A storage notification follows the same recovery path as the same-tab picker.
      localStorage.setItem(microphoneDeviceSettingsKey("screen-a"), JSON.stringify({deviceId: "good"}));
      window.dispatchEvent(Object.assign(new globalThis.Event("storage"), {key: microphoneDeviceSettingsKey("screen-a")}));
      await eventually(() => assert.equal(manager.noiseService.status, "active"));
      assert.deepEqual(starts, ["missing", "good", "bad-again", "good"]);
      if (mode === "manual") assert.equal(manualCard.state.manualEndsAt, manualEndsAt, "device changes cannot extend the manual deadline");
    }
    manager.unmount();
    assert.ok(tracks.every(track => track.stopped));
  });
}
