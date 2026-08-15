import test from "node:test";
import assert from "node:assert/strict";
import {createNotificationDeliveryQueue} from "../src/utils/notificationDeliveryQueue.js";

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
