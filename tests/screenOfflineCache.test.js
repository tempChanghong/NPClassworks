import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCachedScreenFeed,
  loadCachedScreenSession,
  saveCachedScreenFeed,
  saveCachedScreenSession,
  screenFeedCacheKey,
  SCREEN_FEED_CACHE_MAX_ENTRIES,
  SCREEN_FEED_CACHE_MAX_BYTES,
} from "../src/utils/screenOfflineCache.js";

function fakeStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("offline feeds expire notices individually and keep homework and future expiry transitions", t => {
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  const storage = fakeStorage();
  const notice = {type: "NOTICE", status: "PUBLISHED", publishAt: new Date(now - 1000).toISOString()};
  const items = [
    {...notice, id: "expired", expiresAt: new Date(now).toISOString()},
    {...notice, id: "soon", expiresAt: new Date(now + 1000).toISOString()},
    {...notice, id: "later", expiresAt: new Date(now + 2000).toISOString()},
    {...notice, id: "legacy", expiresAt: null},
    {id: "homework", type: "ASSIGNMENT", expiresAt: new Date(now - 1000).toISOString()},
  ];
  saveCachedScreenFeed("screen", "date", {items, nextTransitionAt: new Date(now).toISOString()}, storage);
  const raw = storage.getItem(screenFeedCacheKey("screen", "date"));
  let cached = loadCachedScreenFeed("screen", "date", storage);
  assert.deepEqual(cached.items.map(item => item.id), ["soon", "later", "legacy", "homework"]);
  assert.equal(cached.nextTransitionAt, new Date(now + 1000).toISOString());
  t.mock.method(Date, "now", () => now + 1000);
  cached = loadCachedScreenFeed("screen", "date", storage);
  assert.deepEqual(cached.items.map(item => item.id), ["later", "legacy", "homework"]);
  assert.equal(cached.nextTransitionAt, new Date(now + 2000).toISOString());
  t.mock.method(Date, "now", () => now + 2000);
  assert.equal(loadCachedScreenFeed("screen", "date", storage).nextTransitionAt, null);
  assert.equal(storage.getItem(screenFeedCacheKey("screen", "date")), raw);
});

test("screen session and feed can be restored after an offline reload", () => {
  const storage = fakeStorage();
  saveCachedScreenSession({binding: {id: "screen-a"}}, storage);
  saveCachedScreenFeed("screen-a", "2026-08-19", {items: [{id: "p1"}]}, storage);
  assert.equal(loadCachedScreenSession(storage).binding.id, "screen-a");
  assert.equal(loadCachedScreenFeed("screen-a", "2026-08-19", storage).items[0].id, "p1");
});

test("startup removes expired and corrupt display caches without touching queued work, credentials or drafts", () => {
  const storage = fakeStorage();
  const expiredKey = screenFeedCacheKey("old-screen", "old-date");
  storage.setItem(expiredKey, JSON.stringify({savedAt: Date.now() - 4 * 86400000, value: {items: []}}));
  storage.setItem(screenFeedCacheKey("broken", "date"), "{broken");
  const protectedKeys = ["classworks-v2-screen-publication-queue:screen-a", "classworks-v2-screen-token", "classworks-v2-screen-homework-draft:screen-a:new"];
  for (const key of protectedKeys) storage.setItem(key, "keep-exactly");
  saveCachedScreenSession({binding: {id: "screen-a"}}, storage);
  assert.equal(loadCachedScreenSession(storage).binding.id, "screen-a");
  assert.equal(storage.getItem(expiredKey), null);
  assert.equal(storage.getItem(screenFeedCacheKey("broken", "date")), null);
  for (const key of protectedKeys) assert.equal(storage.getItem(key), "keep-exactly");
});

test("display cache evicts oldest entries across bindings while keeping the incoming feed", () => {
  const storage = fakeStorage();
  for (let i = 0; i < SCREEN_FEED_CACHE_MAX_ENTRIES; i++) {
    storage.setItem(screenFeedCacheKey(`screen-${i}`, "date"), JSON.stringify({savedAt: Date.now() - 10000 + i, value: {items: []}}));
  }
  saveCachedScreenFeed("current", "today", {items: [{id: "latest"}]}, storage);
  assert.equal(storage.length, SCREEN_FEED_CACHE_MAX_ENTRIES);
  assert.equal(loadCachedScreenFeed("screen-0", "date", storage), null);
  assert.equal(loadCachedScreenFeed("current", "today", storage).items[0].id, "latest");
});

test("display cache respects its byte budget and replacing a feed does not evict another unnecessarily", () => {
  const storage = fakeStorage();
  for (let i = 0; i < 8; i++) saveCachedScreenFeed("screen", String(i), {content: "中".repeat(100000)}, storage);
  const bytes = () => Array.from({length: storage.length}, (_, i) => storage.key(i))
    .reduce((sum, key) => sum + 2 * (key.length + storage.getItem(key).length), 0);
  assert.ok(bytes() <= SCREEN_FEED_CACHE_MAX_BYTES);
  assert.ok(storage.length < 8);
  const count = storage.length;
  saveCachedScreenFeed("screen", "7", {content: "updated"}, storage);
  assert.equal(storage.length, count);
  assert.equal(loadCachedScreenFeed("screen", "7", storage).content, "updated");
});

test("quota recovery evicts only older display caches and oversized feeds keep the last usable cache", () => {
  const storage = fakeStorage();
  saveCachedScreenFeed("old", "date", {items: []}, storage);
  const oldKey = screenFeedCacheKey("old", "date");
  const queueKey = "classworks-v2-screen-publication-queue:screen-a";
  storage.setItem(queueKey, "pending-work");
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (key !== oldKey && storage.getItem(oldKey)) throw Object.assign(new Error("full"), {name: "QuotaExceededError"});
    set(key, value);
  };
  saveCachedScreenFeed("current", "today", {content: "available offline"}, storage);
  assert.equal(storage.getItem(oldKey), null);
  assert.equal(storage.getItem(queueKey), "pending-work");
  const oversized = {content: "x".repeat(SCREEN_FEED_CACHE_MAX_BYTES)};
  assert.equal(saveCachedScreenFeed("current", "today", oversized, storage), oversized);
  assert.equal(loadCachedScreenFeed("current", "today", storage).content, "available offline");
});

test("storage access and removal failures do not interrupt online use or offline startup", () => {
  const storage = {
    get length() { throw new Error("denied"); },
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
    removeItem() { throw new Error("denied"); },
  };
  const feed = {items: [{id: "online"}]};
  assert.equal(saveCachedScreenFeed("screen", "date", feed, storage), feed);
  assert.equal(loadCachedScreenSession(storage), null);
  assert.equal(loadCachedScreenFeed("screen", "date", storage), null);
});
