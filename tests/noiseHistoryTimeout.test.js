import assert from "node:assert/strict";
import test from "node:test";
import {createNoiseHistoryStore} from "../src/utils/noiseHistoryStore.js";

test("stalled opens time out, retries are independent, and late success closes only its abandoned connection", async t => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const requests = [];
  const store = createNoiseHistoryStore({indexedDB: {open() { const request = {}; requests.push(request); return request; }}, storage: {getItem: () => null}});
  const first = assert.rejects(store.read(), /打开超时/);
  t.mock.timers.tick(10000); await first;
  const second = assert.rejects(store.read(), /已关闭/);
  let closed = 0;
  requests[0].result = {close() { closed++; }};
  requests[0].onsuccess();
  assert.equal(closed, 1);
  assert.equal(requests.length, 2);
  await store.close(); await second;
  let aborted = 0;
  requests[1].transaction = {abort() { aborted++; }};
  requests[1].onupgradeneeded();
  assert.equal(aborted, 1, "a cancelled open cannot create an empty replacement database later");
});

test("a blocked open rejects promptly and a late error cannot invalidate the retry", async () => {
  const requests = [];
  const store = createNoiseHistoryStore({indexedDB: {open() { const request = {}; requests.push(request); return request; }}, storage: {getItem: () => null}});
  const blocked = assert.rejects(store.read(), /其他页面占用/);
  requests[0].onblocked(); await blocked;
  const next = assert.rejects(store.read(), /已关闭/);
  requests[0].error = new Error("old request"); requests[0].onerror();
  await store.close(); await next;
});
