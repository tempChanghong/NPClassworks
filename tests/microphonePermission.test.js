import assert from "node:assert/strict";
import test from "node:test";
import {classifyMicrophoneError, microphonePermissionLabel} from "../src/utils/microphonePermission.js";

test("microphone errors distinguish permission, hardware and constraints", () => {
  assert.equal(classifyMicrophoneError({name: "NotAllowedError"}), "permission-denied");
  assert.equal(classifyMicrophoneError({name: "NotFoundError"}), "unavailable");
  assert.equal(classifyMicrophoneError({name: "NotReadableError"}), "device-busy");
  assert.equal(classifyMicrophoneError({name: "OverconstrainedError"}), "constraints-error");
  assert.equal(classifyMicrophoneError({}, {secureContext: false}), "insecure-context");
});

test("microphone permission labels explain recovery paths", () => {
  assert.match(microphonePermissionLabel("device-busy"), /占用/);
  assert.match(microphonePermissionLabel("insecure-context"), /HTTPS/);
});
