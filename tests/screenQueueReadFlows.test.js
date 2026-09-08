import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, eventually} from "./helpers/flowHarness.js";

let h;
const key = "classworks-v2-screen-publication-queue:screen-a";
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset();
  navigator.onLine = true;
  h.routes.set("POST /api/v2/classroom-screens/heartbeat", (_req, reply) => reply({commands: []}));
});

function failReads(t, target = key) {
  const read = h.storage.getItem;
  return t.mock.method(h.storage, "getItem", name => {
    if (name === target) throw new Error("Storage unavailable");
    return read(name);
  });
}

test("initial unreadable queue is not synced and automatically uploads after storage/network recovery", async t => {
  h.queue.enqueueScreenPublication("screen-a", {content: "待恢复作业"});
  const raw = h.storage.getItem(key);
  const read = failReads(t);
  navigator.onLine = false;
  const store = h.newStore({screen: true});
  store.initializeScreenSync();
  assert.ok(store.screenQueueReadError);
  assert.notEqual(store.screenSyncState, "synced");
  assert.equal(store.screenPendingUploads.length, 0);
  read.mock.restore();
  assert.equal(h.storage.getItem(key), raw);
  navigator.onLine = true;
  window.dispatchEvent(new globalThis.Event("online"));
  await eventually(() => assert.equal(h.publications.length, 1));
  await eventually(() => assert.equal(store.screenPendingUploads.length, 0));
  assert.equal(store.screenQueueReadError, "");
  assert.equal(h.queue.loadScreenPublicationQueue("screen-a").length, 0);
});

test("failed initialization and flush retain the last known list without submitting from it", async t => {
  const store = h.newStore({screen: true});
  await store.enqueueOfflineScreenPublication({content: "保留内存副本"});
  const original = store.screenPendingUploads[0].id;
  const read = failReads(t);
  store.initializeScreenSync();
  await store.flushScreenPublicationQueue();
  assert.equal(store.screenPendingUploads[0].id, original);
  assert.ok(store.screenQueueReadError);
  assert.equal(store.screenSyncing, false);
  assert.equal(h.publications.length, 0);
  assert.equal(await store.retryScreenQueuedPublication(original), false);
  await store.removeScreenQueuedPublication(original);
  assert.equal(store.screenPendingUploads[0].id, original);
  read.mock.restore();
  await store.flushScreenPublicationQueue();
  assert.equal(h.publications.length, 1);
  assert.equal(store.screenQueueReadError, "");
});

test("an unknown queue retries with backoff without another network event and stops after disposal", async t => {
  const scheduled = [];
  const realTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    if (delay >= 15_000 && delay <= 300_000) {
      scheduled.push(callback);
      return -scheduled.length;
    }
    return realTimeout(callback, delay, ...args);
  });
  const read = failReads(t);
  const store = h.newStore({screen: true});
  store.initializeScreenSync();
  await eventually(() => assert.equal(scheduled.length, 1));
  assert.ok(store.screenQueueReadError);
  read.mock.restore();
  scheduled.shift()();
  await eventually(() => assert.equal(store.screenQueueReadError, ""));
  assert.equal(scheduled.length, 0);
  const blocked = failReads(t);
  await store.flushScreenPublicationQueue();
  assert.equal(scheduled.length, 1);
  store.stopScreenSync();
  const calls = blocked.mock.callCount();
  scheduled.shift()();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(blocked.mock.callCount(), calls);
});

test("malformed or non-array queue remains untouched and can recover manually while offline", () => {
  const store = h.newStore({screen: true});
  store.screenNetworkOnline = false;
  for (const raw of ["{broken", '{"unexpected":true}']) {
    h.storage.setItem(key, raw);
    assert.equal(store.recoverScreenPublicationQueue(), false);
    assert.ok(store.screenQueueReadError);
    assert.equal(h.storage.getItem(key), raw);
  }
  store.screenError = "另一项操作失败";
  h.storage.setItem(key, "[]");
  assert.equal(store.recoverScreenPublicationQueue(), true);
  assert.equal(store.screenQueueReadError, "");
  assert.equal(store.screenError, "另一项操作失败");
});

test("rebinding clears only the previous binding's memory even when the new queue is unreadable", async t => {
  const store = h.newStore({screen: true});
  await store.enqueueOfflineScreenPublication({content: "A 班作业"});
  const raw = h.storage.getItem(key);
  failReads(t, "classworks-v2-screen-publication-queue:screen-b");
  store.screenSession = {binding: {id: "screen-b"}};
  await store.flushScreenPublicationQueue();
  assert.equal(store.screenPendingUploads.length, 0);
  assert.ok(store.screenQueueReadError);
  assert.equal(h.storage.getItem(key), raw);
  assert.equal(h.publications.length, 0);
  store.screenSession = {binding: {id: "screen-a"}};
  assert.equal(store.readScreenPublicationQueue(), true);
  assert.equal(store.screenPendingUploads[0].input.content, "A 班作业");
  assert.equal(store.screenQueueReadError, "");
});

test("a read failure after the server saves preserves the queue and retries the same request ID", async t => {
  const store = h.newStore({screen: true});
  await store.enqueueOfflineScreenPublication({content: "已保存但无法更新本机"});
  const id = store.screenPendingUploads[0].input.clientRequestId;
  let read;
  const ids = [];
  h.routes.set("POST /api/v2/classroom-screens/publications", (req, reply) => {
    ids.push(req.body.clientRequestId);
    if (ids.length === 1) read = failReads(t);
    reply({id: "saved", ...req.body});
  });
  await store.flushScreenPublicationQueue();
  assert.ok(store.screenQueueReadError);
  assert.equal(store.screenPendingUploads.length, 1);
  assert.equal(store.screenSyncing, false);
  read.mock.restore();
  await store.flushScreenPublicationQueue();
  assert.deepEqual(ids, [id, id]);
  assert.equal(store.screenPendingUploads.length, 0);
  assert.equal(store.screenQueueReadError, "");
});

test("final read failure does not restore an already removed item or leave syncing stuck", async t => {
  const store = h.newStore({screen: true});
  await store.enqueueOfflineScreenPublication({content: "已完成上传"});
  h.routes.set("GET /api/v2/classroom-screens/feed", (_req, reply) => {
    failReads(t);
    reply({items: h.publications});
  });
  await store.flushScreenPublicationQueue();
  assert.equal(h.publications.length, 1);
  assert.equal(store.screenPendingUploads.length, 0);
  assert.ok(store.screenQueueReadError);
  assert.equal(store.screenSyncing, false);
  assert.notEqual(store.screenSyncState, "synced");
});
