import assert from "node:assert/strict";
import test from "node:test";
import {createScreenUploadRetry} from "../src/utils/screenUploadRetry.js";
import {isTransientScreenRequestError} from "../src/stores/classworksV2/screenRequestError.js";

function harness(random = 1) {
  const timers = new Map();
  let sequence = 0;
  const state = {online: true, pending: true, calls: 0, errors: []};
  const retry = createScreenUploadRetry({
    run: () => { state.calls++; },
    isOnline: () => state.online,
    hasPending: () => state.pending,
    random: () => random,
    schedule: (callback, delay) => { timers.set(++sequence, {callback, delay}); return sequence; },
    cancel: (id) => timers.delete(id),
    onError: (error) => state.errors.push(error),
  });
  return {retry, timers, state, async fire() {
    const [id, entry] = timers.entries().next().value;
    timers.delete(id); entry.callback();
    await Promise.resolve();
    return entry.delay;
  }};
}

test("retry ceilings grow exponentially, cap at five minutes, and jitter spreads clients", async () => {
  for (const [fraction, expected] of [[1, [30000, 60000, 120000, 240000, 300000, 300000]],
    [0, [15000, 30000, 60000, 120000, 150000, 150000]]]) {
    const h = harness(fraction);
    const actual = [];
    for (let i = 0; i < expected.length; i++) {
      h.retry.failed(); h.retry.request();
      actual.push(await h.fire());
    }
    assert.deepEqual(actual, expected);
    h.retry.succeeded(); h.retry.failed(); h.retry.request();
    assert.equal(await h.fire(), expected[0]);
    h.retry.dispose();
  }
});

test("recovery is spread over two seconds, duplicate events cannot bypass backoff", async () => {
  const h = harness(0.5);
  h.retry.request({recovered: true}); h.retry.request(); h.retry.request();
  assert.equal(h.timers.size, 1);
  assert.equal(await h.fire(), 1000);
  h.retry.failed(); h.retry.request();
  const waiting = [...h.timers.values()][0];
  h.retry.request(); h.retry.request();
  assert.equal([...h.timers.values()][0], waiting);
  assert.equal(await h.fire(), 22500);
  h.retry.dispose();
});

test("offline, empty queues and disposal cancel all automatic work", async () => {
  const h = harness();
  h.retry.failed(); h.retry.request();
  h.state.online = false; h.retry.pause(); h.retry.request();
  assert.equal(h.timers.size, 0);
  h.state.online = true; h.retry.request({recovered: true});
  assert.equal(await h.fire(), 2000);
  h.retry.failed(); h.retry.request();
  h.state.pending = false; h.retry.request();
  assert.equal(h.timers.size, 0);
  h.state.pending = true; h.retry.request();
  const callback = [...h.timers.values()][0].callback;
  callback(); h.retry.dispose();
  await Promise.resolve();
  assert.equal(h.state.calls, 1, "dispose must also cancel a queued microtask");
  h.retry.request();
});

test("an explicit attempt cancels an older automatic callback", async () => {
  const h = harness();
  h.retry.request();
  const callback = [...h.timers.values()][0].callback;
  h.retry.begin(); callback();
  await Promise.resolve();
  assert.equal(h.state.calls, 0);
  assert.equal(h.timers.size, 0);
  h.retry.dispose();
});

test("timeouts, throttling and server failures retry; permission and validation failures do not", () => {
  for (const status of [408, 429, 500, 502, 503, 504, 599]) {
    assert.equal(isTransientScreenRequestError({response: {status}}), true);
  }
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(isTransientScreenRequestError({response: {status}}), false);
  }
  assert.equal(isTransientScreenRequestError(new Error("offline")), true);
});
