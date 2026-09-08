import test from "node:test";
import assert from "node:assert/strict";
import {
  clearScreenHomeworkDraft,
  loadScreenHomeworkDraft,
  saveScreenHomeworkDraft,
  screenHomeworkDraftKey,
  ScreenHomeworkDraftError,
} from "../src/utils/screenHomeworkDraft.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("draft persistence preserves its source revision and treats legacy metadata as unknown", () => {
  const storage = memoryStorage();
  saveScreenHomeworkDraft("screen", "pub", {content: "旧草稿", baseRevision: 1, basePublishAt: "2026-09-08T00:00:00Z"}, storage, 1000);
  const draft = loadScreenHomeworkDraft("screen", "pub", storage, 2000);
  assert.equal(draft.baseRevision, 1);
  assert.equal(draft.basePublishAt, "2026-09-08T00:00:00Z");
  storage.setItem(screenHomeworkDraftKey("screen", "pub"), JSON.stringify({content: "旧格式", updatedAt: 1000}));
  assert.equal(loadScreenHomeworkDraft("screen", "pub", storage, 2000).baseRevision, null);
});

test("screen homework drafts are isolated per screen and publication", () => {
  const storage = memoryStorage();
  saveScreenHomeworkDraft("screen-a", "new", {content: "练习册第10页"}, storage, 1000);
  saveScreenHomeworkDraft("screen-b", "pub-1", {content: "背诵课文"}, storage, 1000);
  assert.equal(loadScreenHomeworkDraft("screen-a", "new", storage, 2000).content, "练习册第10页");
  assert.equal(loadScreenHomeworkDraft("screen-b", "pub-1", storage, 2000).content, "背诵课文");
});

test("screen homework drafts clear after save and expire after seven days", () => {
  const storage = memoryStorage();
  saveScreenHomeworkDraft("screen-a", "new", {subjectId: "physics"}, storage, 1000);
  assert.equal(loadScreenHomeworkDraft("screen-a", "new", storage, 8 * 24 * 60 * 60 * 1000), null);
  assert.equal(storage.getItem(screenHomeworkDraftKey("screen-a", "new")), null);
  saveScreenHomeworkDraft("screen-a", "new", {content: "作业"}, storage, 2000);
  clearScreenHomeworkDraft("screen-a", "new", storage);
  assert.equal(storage.getItem(screenHomeworkDraftKey("screen-a", "new")), null);
});

test("failed reads preserve the original draft and never attempt deletion", () => {
  const storage = memoryStorage();
  const key = screenHomeworkDraftKey("screen-a", "new");
  saveScreenHomeworkDraft("screen-a", "new", {content: "保留原文"}, storage);
  const raw = storage.getItem(key);
  let removals = 0;
  assert.throws(() => loadScreenHomeworkDraft("screen-a", "new", {
    getItem() { throw new Error("Read blocked"); },
    removeItem() { removals += 1; throw new Error("Remove blocked"); },
  }), ScreenHomeworkDraftError);
  assert.equal(removals, 0);
  assert.equal(storage.getItem(key), raw);
});

test("invalid JSON and invalid draft shapes remain available for recovery", () => {
  const storage = memoryStorage();
  const key = screenHomeworkDraftKey("screen-a", "new");
  for (const raw of ["{broken", "null", "[]", '"text"']) {
    storage.setItem(key, raw);
    assert.throws(() => loadScreenHomeworkDraft("screen-a", "new", storage), ScreenHomeworkDraftError);
    assert.equal(storage.getItem(key), raw);
  }
});

test("localStorage accessor failure is converted to a draft read error", t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  });
  Object.defineProperty(globalThis, "localStorage", {configurable: true, get() { throw new Error("SecurityError"); }});
  assert.throws(() => loadScreenHomeworkDraft("screen-a", "new"), ScreenHomeworkDraftError);
});

test("expired draft cleanup failure is reported safely and cleanup succeeds on retry", () => {
  const storage = memoryStorage();
  const key = screenHomeworkDraftKey("screen-a", "new");
  saveScreenHomeworkDraft("screen-a", "new", {content: "过期草稿"}, storage, 1000);
  const now = 8 * 86400000;
  assert.throws(() => loadScreenHomeworkDraft("screen-a", "new", {
    getItem: storage.getItem,
    removeItem() { throw new Error("Remove blocked"); },
  }, now), ScreenHomeworkDraftError);
  assert.ok(storage.getItem(key));
  assert.equal(loadScreenHomeworkDraft("screen-a", "new", storage, now), null);
  assert.equal(storage.getItem(key), null);
});
