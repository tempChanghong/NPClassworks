import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
const uploadPath = "POST /api/v2/classroom-screens/publications";
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => { h.reset(); navigator.onLine = true; });

function scheduledScreen(t, contents = ["待补传作业"]) {
  const timers = new Map();
  const realTimeout = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  // Only control upload delays; Axios timeouts and HTTP processing still run normally.
  t.mock.method(Math, "random", () => 1);
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    if (![2000, 30000, 60000, 120000, 240000, 300000].includes(delay)) {
      return realTimeout(callback, delay, ...args);
    }
    const id = {};
    timers.set(id, {callback, delay});
    return id;
  });
  t.mock.method(globalThis, "clearTimeout", (id) => {
    if (!timers.delete(id)) realClear(id);
  });
  const store = h.newStore({screen: true});
  t.mock.method(store, "sendScreenHeartbeat", async () => {});
  for (const content of contents) store.enqueueOfflineScreenPublication({content});
  store.initializeScreenSync();
  t.after(() => store.stopScreenSync());
  return {store, timers,
    delay() {
      assert.equal(timers.size, 1);
      return [...timers.values()][0].delay;
    },
    fire() {
      assert.equal(timers.size, 1);
      const [id, {callback}] = timers.entries().next().value;
      timers.delete(id); callback();
    },
  };
}

test("real store retries throttle/server failures with backoff, pauses offline and drains on recovery", async (t) => {
  const healthy = h.routes.get(uploadPath);
  h.routes.set(uploadPath, (_req, reply) => reply({message: "busy"}, 429));
  const s = scheduledScreen(t);
  assert.equal(s.delay(), 2000);
  s.fire();
  await eventually(() => assert.equal(s.delay(), 30000));
  const firstId = h.requests.find((req) => req.method === "POST").body.clientRequestId;
  assert.ok(firstId);
  h.realtime.emitServerEvent("connection-state", {connected: true});
  window.dispatchEvent(new globalThis.Event("online"));
  assert.equal(s.delay(), 30000, "duplicate recovery events must preserve the pending backoff");
  h.routes.set(uploadPath, (_req, reply) => reply({message: "unavailable"}, 503));
  s.fire();
  await eventually(() => assert.equal(s.delay(), 60000));
  navigator.onLine = false; window.dispatchEvent(new globalThis.Event("offline"));
  assert.equal(s.timers.size, 0);
  assert.equal(s.store.screenPendingUploads[0].status, "pending");
  h.routes.set(uploadPath, healthy);
  navigator.onLine = true; window.dispatchEvent(new globalThis.Event("online"));
  assert.equal(s.delay(), 2000);
  s.fire();
  await eventually(() => {
    assert.equal(s.store.screenPendingUploads.length, 0);
    assert.equal(s.store.screenSyncing, false);
  });
  assert.equal(s.timers.size, 0);
  assert.deepEqual(h.requests.filter((req) => req.method === "POST").map((req) => req.body.clientRequestId),
    [firstId, firstId, firstId]);
  assert.equal(h.publications.length, 1);
  assert.equal(s.store.feed[0].content, "待补传作业");
});

test("permission errors stay in manual review without any further automatic timer", async (t) => {
  h.routes.set(uploadPath, (_req, reply) => reply({code: "SCREEN_TOKEN_INVALID", message: "已停用"}, 401));
  const s = scheduledScreen(t);
  s.fire();
  await eventually(() => assert.equal(s.store.screenPendingUploads[0].status, "needs_review"));
  h.realtime.emitServerEvent("connection-state", {connected: true});
  assert.equal(s.timers.size, 0);
  assert.equal(h.requests.filter((req) => req.method === "POST").length, 1);
  assert.equal(h.queue.loadScreenPublicationQueue("screen-a").length, 1);
});

test("late uploads cannot change a replacement session or send the remaining old queue with its token", async (t) => {
  const response = deferred();
  const entered = deferred();
  h.routes.set(uploadPath, async (_req, reply) => { entered.resolve(); await response.promise; reply({id: "old"}); });
  const s = scheduledScreen(t, ["旧班第一项", "旧班第二项"]);
  // Keep the promise to explicitly wait for the stale batch to finish.
  const flushing = s.store.flushScreenPublicationQueue();
  try {
    await entered.promise;
    assert.equal(await s.store.retryScreenQueuedPublication(s.store.screenPendingUploads[0].id), false);
    s.store.screenSession = {binding: {id: "screen-b"}, workspaces: []};
    h.api.saveClassroomScreenToken("screen-b-token");
    s.store.initializeScreenSync();
    response.resolve(); await flushing;
    assert.equal(s.store.screenSyncing, false);
    assert.equal(s.store.screenPendingUploads.length, 0);
    assert.equal(s.timers.size, 0);
    assert.equal(h.queue.loadScreenPublicationQueue("screen-a").length, 2);
    const uploads = h.requests.filter((req) => req.method === "POST");
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].headers["x-classworks-screen-token"], "screen-a-token");
  } finally { response.resolve(); await flushing; }
});

test("failed persistence after a successful upload retains the request ID and also backs off", async (t) => {
  const s = scheduledScreen(t);
  const id = s.store.screenPendingUploads[0].input.clientRequestId;
  const write = h.storage.setItem;
  t.mock.method(h.storage, "setItem", (key, value) => {
    if (key.startsWith("classworks-v2-screen-publication-queue:")) throw new Error("QuotaExceededError");
    write(key, value);
  });
  s.fire();
  await eventually(() => assert.equal(s.delay(), 30000));
  assert.equal(s.store.screenPendingUploads[0].input.clientRequestId, id);
  assert.equal(h.queue.loadScreenPublicationQueue("screen-a").length, 1);
  assert.match(s.store.screenError, /未能保存/);
  assert.equal(h.requests.filter((req) => req.method === "POST").length, 1);
});
