import test from "node:test";
import assert from "node:assert/strict";
import {
  enqueueScreenPublication,
  loadScreenPublicationQueue,
  removeScreenPublicationQueueItem,
  updateScreenPublicationQueueItem,
} from "../src/utils/screenPublicationQueue.js";

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("offline screen assignments persist per classroom binding", () => {
  const storage = fakeStorage();
  enqueueScreenPublication("screen-a", {content: "作业A"}, {subjectName: "物理"}, storage, Date.now());
  assert.equal(loadScreenPublicationQueue("screen-a", storage).length, 1);
  assert.equal(loadScreenPublicationQueue("screen-b", storage).length, 0);
});

test("queued assignments retain review state and can be removed", () => {
  const storage = fakeStorage();
  const [queued] = enqueueScreenPublication("screen-a", {content: "作业A"}, {}, storage, Date.now());
  const updated = updateScreenPublicationQueueItem("screen-a", queued.id, {
    status: "needs_review",
    attempts: 1,
    error: {code: "DUPLICATE_ASSIGNMENT_SUSPECTED"},
  }, storage);
  assert.equal(updated[0].status, "needs_review");
  assert.deepEqual(removeScreenPublicationQueueItem("screen-a", queued.id, storage), []);
});
