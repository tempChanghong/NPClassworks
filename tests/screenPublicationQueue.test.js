import test from "node:test";
import assert from "node:assert/strict";
import {
  enqueueScreenPublication,
  loadScreenPublicationQueue,
  removeScreenPublicationQueueItem,
  saveScreenPublicationQueue,
  screenPublicationQueueKey,
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

test("failed persistence rejects a new assignment and leaves the existing queue intact", () => {
  const storage = fakeStorage();
  const original = enqueueScreenPublication("screen-a", {content: "已有作业"}, {}, storage);
  const failingStorage = {...storage, setItem() { throw new Error("QuotaExceededError"); }};
  assert.throws(() => enqueueScreenPublication("screen-a", {content: "未保存作业"}, {}, failingStorage),
    {code: "SCREEN_QUEUE_WRITE_FAILED"});
  assert.deepEqual(loadScreenPublicationQueue("screen-a", storage), original);
  assert.throws(() => removeScreenPublicationQueueItem("screen-a", original[0].id, failingStorage),
    {code: "SCREEN_QUEUE_WRITE_FAILED"});
  assert.throws(() => updateScreenPublicationQueueItem("screen-a", original[0].id, {status: "needs_review"}, failingStorage),
    {code: "SCREEN_QUEUE_WRITE_FAILED"});
  assert.deepEqual(loadScreenPublicationQueue("screen-a", storage), original);
});

test("unreadable or corrupt storage cannot be overwritten by enqueue", () => {
  let writes = 0;
  const unavailable = {getItem() { throw new Error("SecurityError"); }, setItem() { writes++; }};
  assert.throws(() => enqueueScreenPublication("screen-a", {content: "作业"}, {}, unavailable),
    {code: "SCREEN_QUEUE_READ_FAILED"});
  assert.equal(writes, 0);
  for (const raw of ["broken JSON", "{}"]) {
    const storage = fakeStorage();
    storage.setItem(screenPublicationQueueKey("screen-a"), raw);
    assert.throws(() => enqueueScreenPublication("screen-a", {content: "作业"}, {}, storage),
      {code: "SCREEN_QUEUE_READ_FAILED"});
    assert.equal(storage.getItem(screenPublicationQueueKey("screen-a")), raw);
  }
});

test("the 51st assignment is rejected without evicting any pending work", () => {
  const storage = fakeStorage();
  for (let i = 0; i < 50; i++) enqueueScreenPublication("screen-a", {content: String(i)}, {}, storage);
  const original = loadScreenPublicationQueue("screen-a", storage);
  assert.throws(() => enqueueScreenPublication("screen-a", {content: "overflow"}, {}, storage),
    {code: "SCREEN_QUEUE_FULL"});
  assert.deepEqual(loadScreenPublicationQueue("screen-a", storage), original);
  removeScreenPublicationQueueItem("screen-a", original[0].id, storage);
  assert.equal(enqueueScreenPublication("screen-a", {content: "new"}, {}, storage).length, 50);
});

test("old assignments survive reload as review items while fresh work remains pending", () => {
  const storage = fakeStorage();
  const old = Date.now() - 30 * 24 * 60 * 60 * 1000;
  enqueueScreenPublication("screen-a", {content: "旧作业", boardDate: "2026-08-01"}, {}, storage, old);
  enqueueScreenPublication("screen-a", {content: "新作业"}, {}, storage);
  const items = loadScreenPublicationQueue("screen-a", storage);
  assert.equal(items.length, 2);
  assert.equal(items[0].status, "needs_review");
  assert.equal(items[0].error.code, "SCREEN_QUEUE_EXPIRED");
  assert.equal(items[0].input.boardDate, "2026-08-01");
  assert.equal(items[1].status, "pending");
  saveScreenPublicationQueue("screen-a", items, storage);
  assert.deepEqual(loadScreenPublicationQueue("screen-a", storage), items);
});

test("preexisting oversized queues are preserved and can be reduced manually", () => {
  const storage = fakeStorage();
  const items = Array.from({length: 51}, (_, i) => ({
    id: String(i), input: {content: String(i)}, queuedAt: Date.now(),
  }));
  storage.setItem(screenPublicationQueueKey("screen-a"), JSON.stringify(items));
  assert.equal(loadScreenPublicationQueue("screen-a", storage).length, 51);
  const updated = updateScreenPublicationQueueItem("screen-a", "0", {status: "needs_review"}, storage);
  assert.equal(updated.length, 51);
  assert.equal(removeScreenPublicationQueueItem("screen-a", "0", storage).length, 50);
});
