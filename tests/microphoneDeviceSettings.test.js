import test from "node:test";
import assert from "node:assert/strict";
import {
  loadMicrophoneDeviceSettings,
  microphoneDeviceSettingsKey,
  sanitizeMicrophoneDeviceSettings,
  saveMicrophoneDeviceSettings,
} from "../src/utils/microphoneDeviceSettings.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("microphone selection defaults safely and trims device identifiers", () => {
  assert.deepEqual(sanitizeMicrophoneDeviceSettings(), {deviceId: "default"});
  assert.deepEqual(sanitizeMicrophoneDeviceSettings({deviceId: "  physical-mic  "}), {deviceId: "physical-mic"});
});

test("microphone selection is isolated per screen binding", () => {
  const storage = memoryStorage();
  saveMicrophoneDeviceSettings("screen-a", {deviceId: "mic-a"}, storage);
  assert.deepEqual(loadMicrophoneDeviceSettings("screen-a", storage), {deviceId: "mic-a"});
  assert.deepEqual(loadMicrophoneDeviceSettings("screen-b", storage), {deviceId: "default"});
  assert.equal(microphoneDeviceSettingsKey("screen-a"), "classworks-v2-microphone-device:screen-a");
});
