import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCachedScreenFeed,
  loadCachedScreenSession,
  saveCachedScreenFeed,
  saveCachedScreenSession,
} from "../src/utils/screenOfflineCache.js";

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("screen session and feed can be restored after an offline reload", () => {
  const storage = fakeStorage();
  saveCachedScreenSession({binding: {id: "screen-a"}}, storage);
  saveCachedScreenFeed("screen-a", "2026-08-19", {items: [{id: "p1"}]}, storage);
  assert.equal(loadCachedScreenSession(storage).binding.id, "screen-a");
  assert.equal(loadCachedScreenFeed("screen-a", "2026-08-19", storage).items[0].id, "p1");
});
