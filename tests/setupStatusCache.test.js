import test from "node:test";
import assert from "node:assert/strict";
import {
  clearCompletedSetup,
  hasCompletedSetup,
  rememberCompletedSetup,
  SETUP_STATUS_TIMEOUT_MS,
} from "../src/utils/setupStatusCache.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}

test("completed setup is remembered only for a completed instance", () => {
  const storage = memoryStorage();
  assert.equal(rememberCompletedSetup({state: "NEW"}, storage), false);
  assert.equal(hasCompletedSetup(storage), false);
  assert.equal(rememberCompletedSetup({state: "COMPLETED"}, storage), true);
  assert.equal(hasCompletedSetup(storage), true);
  clearCompletedSetup(storage);
  assert.equal(hasCompletedSetup(storage), false);
});

test("the route setup probe has a short bounded timeout", () => {
  assert.ok(SETUP_STATUS_TIMEOUT_MS >= 1000);
  assert.ok(SETUP_STATUS_TIMEOUT_MS <= 3000);
});
