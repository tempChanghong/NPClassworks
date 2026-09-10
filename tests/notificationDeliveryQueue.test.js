import test from "node:test";
import assert from "node:assert/strict";
import {createNotificationDeliveryQueue, notificationDeliveryStorageKey} from "../src/utils/notificationDeliveryQueue.js";

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const receipt = {publicationId: "notice-a", revision: 1, displayed: true};

function persistentStorage() {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; }};
}

test("offline confirmation survives reload even when the notice is absent from the new feed", async () => {
  const storage = persistentStorage();
  const original = queueHarness(async () => {}, {storage, storageKey: "binding-a", isOnline: () => false});
  await original.queue.enqueue([{...receipt, acknowledged: true}]);
  await original.queue.dispose();
  const sent = [];
  const restored = queueHarness(async items => sent.push(items), {storage, storageKey: "binding-a"});
  assert.equal(restored.queue.pendingCount(), 1);
  await restored.queue.retryNow();
  assert.equal(sent[0][0].acknowledged, true);
  assert.equal(restored.queue.pendingCount(), 0);
  await restored.queue.dispose();
});

test("receipt scope separates backend, binding and credential version without storing credentials", () => {
  const key = notificationDeliveryStorageKey("https://api.example", {id: "a", credentialVersion: 1});
  assert.notEqual(key, notificationDeliveryStorageKey("https://other.example", {id: "a", credentialVersion: 1}));
  assert.notEqual(key, notificationDeliveryStorageKey("https://api.example", {id: "b", credentialVersion: 1}));
  assert.notEqual(key, notificationDeliveryStorageKey("https://api.example", {id: "a", credentialVersion: 2}));
  assert.equal(notificationDeliveryStorageKey("https://api.example", null), "");
});

test("a different binding cannot drain persisted receipts and a blocked queue remains blocked after reload", async () => {
  const storage = persistentStorage();
  const first = queueHarness(async () => { throw {status: 403}; }, {storage, storageKey: "a"});
  await first.queue.enqueue([receipt]);
  await settled();
  await first.queue.dispose();
  let calls = 0;
  const other = queueHarness(async () => calls++, {storage, storageKey: "b"});
  assert.equal(other.queue.pendingCount(), 0);
  const restored = queueHarness(async () => calls++, {storage, storageKey: "a"});
  await restored.queue.retryNow();
  assert.equal(restored.queue.getState().blockedStatus, 403);
  assert.equal(restored.queue.pendingCount(), 1);
  assert.equal(calls, 0);
  await other.queue.dispose(); await restored.queue.dispose();
});

test("corrupt/unreadable storage is not overwritten and recovery merges known acknowledgements", async () => {
  for (const broken of ["read", "json"]) {
    const disk = persistentStorage();
    const initial = queueHarness(async () => {}, {storage: disk, storageKey: "a", isOnline: () => false});
    await initial.queue.enqueue([receipt]); await initial.queue.dispose();
    const original = disk.getItem("a");
    let failed = true, writes = 0;
    const storage = {getItem: key => {
      if (failed && broken === "read") throw new Error("blocked");
      return failed ? "{bad" : disk.getItem(key);
    }, setItem: (key, value) => { writes++; disk.setItem(key, value); }};
    const sent = [];
    const h = queueHarness(async items => sent.push(items), {storage, storageKey: "a"});
    await h.queue.enqueue([{publicationId: "other", revision: 1, acknowledged: true}]);
    assert.equal(h.queue.getState().storageError, "read");
    assert.equal(writes, 0);
    assert.equal(disk.getItem("a"), original);
    failed = false;
    await h.queue.retryNow();
    assert.equal(sent[0].length, 2);
    assert.equal(h.queue.getState().storageError, null);
    await h.queue.dispose();
  }
});

test("quota failure keeps memory receipts and reports that persistence failed until retried", async () => {
  let fail = true;
  const disk = persistentStorage();
  const storage = {getItem: disk.getItem, setItem: (key, value) => {
    if (fail) throw new Error("quota");
    disk.setItem(key, value);
  }};
  const h = queueHarness(async () => {}, {storage, storageKey: "a", isOnline: () => false});
  await h.queue.enqueue([{...receipt, acknowledged: true}]);
  assert.equal(h.queue.getState().storageError, "write");
  assert.equal(h.queue.pendingCount(), 1);
  fail = false;
  await h.queue.retryNow();
  assert.equal(h.queue.getState().storageError, null);
  await h.queue.dispose();
  const restored = queueHarness(async () => {}, {storage, storageKey: "a", isOnline: () => false});
  assert.equal(restored.queue.pendingCount(), 1);
  await restored.queue.dispose();
});

test("restored receipts drain in batches of at most 100 and cannot confirm a newer revision", async () => {
  const storage = persistentStorage();
  const h = queueHarness(async () => {}, {storage, storageKey: "a", isOnline: () => false});
  await h.queue.enqueue(Array.from({length: 205}, (_, index) => ({publicationId: `notice-${index}`, revision: 1, acknowledged: true})));
  await h.queue.dispose();
  let online = false;
  const batches = [];
  const restored = queueHarness(async items => batches.push(items), {storage, storageKey: "a", isOnline: () => online});
  await restored.queue.enqueue([{publicationId: "notice-0", revision: 2, displayed: true}]);
  online = true;
  await restored.queue.retryNow();
  await settled();
  assert.deepEqual(batches.map(items => items.length), [100, 100, 5]);
  assert.equal(batches[0][0].revision, 2);
  assert.equal(batches[0][0].acknowledged, false);
  assert.equal(JSON.parse(storage.getItem("a")).items.length, 0);
  await restored.queue.dispose();
});

test("an old in-flight response after disposal cannot clear restored persisted receipts", async () => {
  let complete;
  const storage = persistentStorage();
  const original = queueHarness(() => new Promise(resolve => { complete = resolve; }), {storage, storageKey: "a"});
  await original.queue.enqueue([receipt]);
  await settled();
  await original.queue.dispose();
  const restored = queueHarness(async () => {}, {storage, storageKey: "a", isOnline: () => false});
  await restored.queue.enqueue([{...receipt, acknowledged: true}]);
  complete(); await settled();
  assert.equal(JSON.parse(storage.getItem("a")).items[0].acknowledged, true);
  await restored.queue.dispose();
});

function queueHarness(send, options = {}) {
  const timers = new Map();
  let sequence = 0;
  const queue = createNotificationDeliveryQueue({
    send,
    withLock: operation => Promise.resolve().then(operation),
    schedule: (callback, delay) => {
      timers.set(++sequence, {callback, delay});
      return sequence;
    },
    cancel: (id) => timers.delete(id),
    ...options,
  });
  return {
    queue, timers,
    fire() {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback();
      return timer.delay;
    },
  };
}

test("two offline queues merge additions and disposal cannot resurrect sent receipts", async () => {
  const storage = persistentStorage();
  const options = {storage, storageKey: "shared", isOnline: () => false};
  const a = queueHarness(async () => {}, options), b = queueHarness(async () => {}, options);
  await Promise.all([
    a.queue.enqueue([{...receipt, acknowledged: true}]),
    b.queue.enqueue([{...receipt, publicationId: "notice-b", acknowledged: true}]),
  ]);
  const read = () => JSON.parse(storage.getItem("shared")).items;
  assert.deepEqual(read().map(item => item.publicationId).sort(), ["notice-a", "notice-b"]);
  const batches = [];
  const restored = queueHarness(async items => batches.push(items), {storage, storageKey: "shared"});
  await restored.queue.retryNow();
  assert.equal(batches[0].length, 2);
  assert.deepEqual(read(), []);
  await a.queue.dispose(); await b.queue.dispose();
  assert.deepEqual(read(), []);
  await restored.queue.dispose();
});

test("successful upload removes only its unchanged snapshot and keeps another tab's additions and upgrades", async () => {
  for (const update of [
    {...receipt, publicationId: "notice-b", acknowledged: true},
    {...receipt, acknowledged: true},
    {...receipt, revision: 2, acknowledged: false},
  ]) {
    const storage = persistentStorage();
    let online = false, finish;
    const a = queueHarness(() => new Promise(resolve => { finish = resolve; }), {storage, storageKey: "shared", isOnline: () => online});
    await a.queue.enqueue([receipt]);
    const b = queueHarness(async () => {}, {storage, storageKey: "shared", isOnline: () => false});
    online = true;
    const sending = a.queue.retryNow(); await settled();
    await b.queue.enqueue([update]);
    online = false; finish(); await sending;
    const read = () => JSON.parse(storage.getItem("shared")).items;
    assert.deepEqual(read(), [{...update, acknowledged: Boolean(update.acknowledged)}]);
    await a.queue.dispose(); await b.queue.dispose();
    assert.equal(read().length, 1);
  }
});

test("idle stale tabs refresh from disk before sending and never resend a completed snapshot", async () => {
  const storage = persistentStorage();
  const a = queueHarness(async () => {}, {storage, storageKey: "shared", isOnline: () => false});
  await a.queue.enqueue([receipt]);
  const sent = [];
  const b = queueHarness(async items => sent.push(items), {storage, storageKey: "shared"});
  await b.queue.retryNow();
  const c = queueHarness(async items => sent.push(items), {storage, storageKey: "shared"});
  await a.queue.retryNow(); // Offline sync still removes stale memory.
  assert.equal(a.queue.pendingCount(), 0);
  await c.queue.retryNow();
  assert.equal(sent.length, 1);
  await a.queue.dispose(); await b.queue.dispose(); await c.queue.dispose();
});

test("failed cleanup retains completion intent and cannot overwrite a later acknowledgement on retry", async () => {
  const disk = persistentStorage();
  let fail = false, online = true, finish;
  const storage = {getItem: disk.getItem, setItem: (key, value) => { if (fail) throw new Error("quota"); disk.setItem(key, value); }};
  const a = queueHarness(() => new Promise(resolve => { finish = resolve; }), {storage, storageKey: "shared", isOnline: () => online});
  await a.queue.enqueue([receipt]); await settled();
  fail = true; online = false; finish(); await settled();
  assert.equal(a.queue.getState().storageError, "write");
  const b = queueHarness(async () => {}, {storage: disk, storageKey: "shared", isOnline: () => false});
  await b.queue.enqueue([{...receipt, acknowledged: true}]);
  fail = false; await a.queue.retryNow();
  assert.equal(JSON.parse(disk.getItem("shared")).items[0].acknowledged, true);
  await a.queue.dispose(); await b.queue.dispose();
});

test("missing cross-tab locks leaves memory visible and never writes an unsafe snapshot", async () => {
  const storage = persistentStorage();
  let sent = 0;
  const h = queueHarness(async () => { sent++; }, {storage, storageKey: "shared", withLock: async () => { throw new Error("unsupported"); }});
  assert.equal(await h.queue.enqueue([receipt]), false);
  await h.queue.retryNow();
  assert.equal(storage.getItem("shared"), null);
  assert.equal(h.queue.pendingCount(), 1);
  assert.equal(h.queue.getState().storageError, "lock");
  assert.equal(sent, 0);
  await h.queue.dispose();
});

test("closing before a queued lock runs leaves immutable intake recoverable without the original feed", async () => {
  const storage = persistentStorage();
  let resume;
  const old = queueHarness(async () => {}, {storage, storageKey: "shared", isOnline: () => false,
    withLock: operation => new Promise(resolve => { resume = () => resolve(operation()); })});
  const saving = old.queue.enqueue([{...receipt, acknowledged: true}]);
  assert.equal(storage.getItem("shared"), null);
  assert.equal(storage.length, 1); // Intake is durable before the lock resolves.
  await old.queue.dispose();
  const sent = [];
  const restored = queueHarness(async items => sent.push(items), {storage, storageKey: "shared"});
  assert.equal(restored.queue.pendingCount(), 1);
  await restored.queue.retryNow();
  assert.equal(sent[0][0].acknowledged, true);
  assert.equal(storage.length, 1); // Only the empty canonical snapshot remains.
  resume(); await saving;
  assert.deepEqual(JSON.parse(storage.getItem("shared")).items, []);
  await restored.queue.dispose();
});

test("a failed intake cleanup retains durable data and recovers without deleting another arrival", async () => {
  const disk = persistentStorage();
  const storage = Object.create(disk);
  storage.removeItem = () => { throw new Error("blocked"); };
  const a = queueHarness(async () => {}, {storage, storageKey: "shared", isOnline: () => false});
  await a.queue.enqueue([receipt]);
  assert.equal(a.queue.getState().storageError, "write");
  const b = queueHarness(async () => {}, {storage: disk, storageKey: "shared", isOnline: () => false});
  await b.queue.enqueue([{...receipt, publicationId: "notice-b"}]);
  storage.removeItem = disk.removeItem;
  await a.queue.retryNow();
  assert.equal(a.queue.getState().storageError, null);
  assert.equal(JSON.parse(disk.getItem("shared")).items.length, 2);
  await a.queue.dispose(); await b.queue.dispose();
});

test("temporary failures back off to a cap and enqueue cannot bypass the wait", async () => {
  let calls = 0;
  const statuses = [503, 429, 408, 502, 503, 503, 503];
  const h = queueHarness(async () => {
    const status = statuses[calls++];
    if (status) throw {response: {status}};
  });
  await h.queue.enqueue([receipt]);
  await settled();
  const delays = [];
  for (let i = 0; i < statuses.length; i++) {
    await h.queue.enqueue([receipt]);
    await h.queue.flush();
    assert.equal(calls, i + 1);
    delays.push(h.fire());
    await settled();
  }
  assert.deepEqual(delays, [10000, 20000, 40000, 80000, 160000, 300000, 300000]);
  assert.equal(h.queue.pendingCount(), 0);
  assert.equal(h.queue.getState().failures, 0);
  await h.queue.dispose();
});

test("permission and validation errors retain pending state without retrying on reconnect", async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    let calls = 0;
    const h = queueHarness(async () => { calls++; throw {response: {status}}; });
    await h.queue.enqueue([receipt]);
    await settled();
    await h.queue.enqueue([{...receipt, acknowledged: true}]);
    await h.queue.retryNow();
    await h.queue.flush();
    assert.equal(calls, 1);
    assert.equal(h.timers.size, 0);
    assert.equal(h.queue.getState().status, "blocked");
    assert.equal(h.queue.getState().blockedStatus, status);
    assert.equal(h.queue.pendingCount(), 1);
    await h.queue.dispose();
  }
});

test("offline pauses requests and timers; reconnect sends one immediate batch", async () => {
  let online = false;
  let calls = 0;
  let complete;
  const h = queueHarness(async () => {
    calls++;
    if (calls === 1) throw new Error("network");
    await new Promise((resolve) => { complete = resolve; });
  }, {isOnline: () => online});
  await h.queue.enqueue([receipt]);
  await settled();
  assert.equal(calls, 0);
  assert.equal(h.queue.getState().status, "offline");
  online = true;
  await h.queue.retryNow();
  assert.equal(h.timers.size, 1);
  online = false;
  h.queue.pause();
  assert.equal(h.timers.size, 0);
  await h.queue.retryNow();
  assert.equal(calls, 1);
  online = true;
  const request = h.queue.retryNow();
  await h.queue.retryNow();
  assert.equal(calls, 2);
  complete();
  await request;
  assert.equal(h.queue.pendingCount(), 0);
  await h.queue.dispose();
});

test("late failure after disposal cannot schedule work or report into a new session", async () => {
  let reject;
  let reports = 0;
  const h = queueHarness(() => new Promise((resolve, fail) => { reject = fail; }), {
    onStateChange: () => reports++,
  });
  await h.queue.enqueue([receipt]);
  await h.queue.dispose();
  const before = reports;
  reject(new Error("late network error"));
  await settled();
  await h.queue.enqueue([receipt]);
  assert.equal(reports, before);
  assert.equal(h.timers.size, 0);
  assert.equal(h.queue.pendingCount(), 0);
});

test("a later display receipt cannot downgrade an acknowledgement or its revision", async () => {
  let online = false;
  const batches = [];
  const h = queueHarness(async (items) => batches.push(items), {isOnline: () => online});
  await h.queue.enqueue([{...receipt, revision: 2, acknowledged: true}]);
  await h.queue.enqueue([{...receipt, revision: 2}, receipt]);
  online = true;
  await h.queue.retryNow();
  assert.equal(batches[0][0].revision, 2);
  assert.equal(batches[0][0].acknowledged, true);
  await h.queue.dispose();
});

test("delivery queue retries a failed receipt without another feed change", async () => {
  const batches = [];
  const scheduled = [];
  let attempts = 0;
  const queue = createNotificationDeliveryQueue({
    send: async (items) => {
      attempts += 1;
      batches.push(items);
      if (attempts === 1) throw new Error("offline");
    },
    schedule: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
    cancel: () => {},
  });

  queue.enqueue([{publicationId: "notice-a", revision: 1, displayed: true}]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(queue.pendingCount(), 1);
  assert.equal(scheduled.length, 1);

  scheduled[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 2);
  assert.equal(queue.pendingCount(), 0);
  assert.equal(batches[1][0].displayed, true);
});

test("a manual acknowledgement supersedes a pending display receipt", async () => {
  let releaseFirst;
  const batches = [];
  const firstRequest = new Promise((resolve) => { releaseFirst = resolve; });
  const queue = createNotificationDeliveryQueue({
    send: async (items) => {
      batches.push(items);
      if (batches.length === 1) await firstRequest;
    },
  });

  queue.enqueue([{publicationId: "notice-a", revision: 2, displayed: true}]);
  queue.enqueue([{publicationId: "notice-a", revision: 2, acknowledged: true}]);
  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(batches.length, 2);
  assert.equal(batches[1][0].acknowledged, true);
  assert.equal(queue.pendingCount(), 0);
});
