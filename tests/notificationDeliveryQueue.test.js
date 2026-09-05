import test from "node:test";
import assert from "node:assert/strict";
import {createNotificationDeliveryQueue} from "../src/utils/notificationDeliveryQueue.js";

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const receipt = {publicationId: "notice-a", revision: 1, displayed: true};

function queueHarness(send, options = {}) {
  const timers = new Map();
  let sequence = 0;
  const queue = createNotificationDeliveryQueue({
    send,
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

test("temporary failures back off to a cap and enqueue cannot bypass the wait", async () => {
  let calls = 0;
  const statuses = [503, 429, 408, 502, 503, 503, 503];
  const h = queueHarness(async () => {
    const status = statuses[calls++];
    if (status) throw {response: {status}};
  });
  h.queue.enqueue([receipt]);
  await settled();
  const delays = [];
  for (let i = 0; i < statuses.length; i++) {
    h.queue.enqueue([receipt]);
    await h.queue.flush();
    assert.equal(calls, i + 1);
    delays.push(h.fire());
    await settled();
  }
  assert.deepEqual(delays, [10000, 20000, 40000, 80000, 160000, 300000, 300000]);
  assert.equal(h.queue.pendingCount(), 0);
  assert.equal(h.queue.getState().failures, 0);
  h.queue.dispose();
});

test("permission and validation errors retain pending state without retrying on reconnect", async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    let calls = 0;
    const h = queueHarness(async () => { calls++; throw {response: {status}}; });
    h.queue.enqueue([receipt]);
    await settled();
    h.queue.enqueue([{...receipt, acknowledged: true}]);
    await h.queue.retryNow();
    await h.queue.flush();
    assert.equal(calls, 1);
    assert.equal(h.timers.size, 0);
    assert.equal(h.queue.getState().status, "blocked");
    assert.equal(h.queue.getState().blockedStatus, status);
    assert.equal(h.queue.pendingCount(), 1);
    h.queue.dispose();
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
  h.queue.enqueue([receipt]);
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
  h.queue.dispose();
});

test("late failure after disposal cannot schedule work or report into a new session", async () => {
  let reject;
  let reports = 0;
  const h = queueHarness(() => new Promise((resolve, fail) => { reject = fail; }), {
    onStateChange: () => reports++,
  });
  h.queue.enqueue([receipt]);
  h.queue.dispose();
  const before = reports;
  reject(new Error("late network error"));
  await settled();
  h.queue.enqueue([receipt]);
  assert.equal(reports, before);
  assert.equal(h.timers.size, 0);
  assert.equal(h.queue.pendingCount(), 0);
});

test("a later display receipt cannot downgrade an acknowledgement or its revision", async () => {
  let online = false;
  const batches = [];
  const h = queueHarness(async (items) => batches.push(items), {isOnline: () => online});
  h.queue.enqueue([{...receipt, revision: 2, acknowledged: true}]);
  h.queue.enqueue([{...receipt, revision: 2}, receipt]);
  online = true;
  await h.queue.retryNow();
  assert.equal(batches[0][0].revision, 2);
  assert.equal(batches[0][0].acknowledged, true);
  h.queue.dispose();
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
