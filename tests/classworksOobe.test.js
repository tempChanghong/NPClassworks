import test from "node:test";
import assert from "node:assert/strict";
import {
  completeClassworksOobe,
  completeScreenOobe,
  isScreenOobeComplete,
  loadClassworksOobeState,
  rememberClassworksOobeRole,
  shouldShowClassworksOobe,
} from "../src/utils/classworksOobe.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("fresh browsers show OOBE while recognized users skip it", () => {
  const fresh = loadClassworksOobeState(memoryStorage());
  assert.equal(shouldShowClassworksOobe({state: fresh}), true);
  assert.equal(shouldShowClassworksOobe({state: fresh, hasStudentSelection: true}), false);
  assert.equal(shouldShowClassworksOobe({state: fresh, isTeacherSignedIn: true}), false);
  assert.equal(shouldShowClassworksOobe({state: fresh, hasScreenSession: true}), false);
});

test("OOBE remembers an unfinished role and records completion", () => {
  const storage = memoryStorage();
  assert.equal(rememberClassworksOobeRole("teacher", storage).roleHint, "teacher");
  assert.equal(loadClassworksOobeState(storage).completed, false);
  completeClassworksOobe("teacher", storage, 1234);
  assert.deepEqual(loadClassworksOobeState(storage), {
    version: 1,
    completed: true,
    roleHint: "teacher",
    completedAt: 1234,
  });
});

test("screen setup completion is isolated per classroom binding", () => {
  const storage = memoryStorage();
  completeScreenOobe("screen-a", storage, 1234);
  assert.equal(isScreenOobeComplete("screen-a", storage), true);
  assert.equal(isScreenOobeComplete("screen-b", storage), false);
});
