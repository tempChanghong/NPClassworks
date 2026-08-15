import test from "node:test";
import assert from "node:assert/strict";
import {
  clearScreenHomeworkDraft,
  loadScreenHomeworkDraft,
  saveScreenHomeworkDraft,
  screenHomeworkDraftKey,
} from "../src/utils/screenHomeworkDraft.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

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
  saveScreenHomeworkDraft("screen-a", "new", {content: "作业"}, storage, 2000);
  clearScreenHomeworkDraft("screen-a", "new", storage);
  assert.equal(storage.getItem(screenHomeworkDraftKey("screen-a", "new")), null);
});
