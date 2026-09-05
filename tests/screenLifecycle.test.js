import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, eventually} from "./helpers/flowHarness.js";

const {Event} = globalThis;
let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => { h.reset(); navigator.onLine = true; document.visibilityState = "visible"; });

test("reconnection catches up a publication whose socket event was missed", async () => {
  const screen = h.newStore({screen: true});
  screen.startRealtime();
  await screen.loadActiveFeed();
  h.publications.push({id: "missed", content: "断线期间发布"});
  h.realtime.emitServerEvent("connect");
  await eventually(() => assert.equal(screen.feed[0]?.id, "missed"));
});

test("returning to a visible screen catches up missed publications without waiting five minutes", async () => {
  const screen = h.newStore({screen: true});
  screen.startRealtime();
  await screen.loadActiveFeed();
  document.visibilityState = "hidden";
  window.dispatchEvent(new Event("visibilitychange"));
  h.publications.push({id: "wake", content: "休眠期间发布"});
  document.visibilityState = "visible";
  window.dispatchEvent(new Event("visibilitychange"));
  await eventually(() => assert.equal(screen.feed[0]?.id, "wake"));
});

test("recovery bursts coalesce to one refresh and stopped subscriptions stay inactive", async () => {
  const screen = h.newStore({screen: true});
  for (let i = 0; i < 30; i++) screen.startRealtime();
  h.publications.push({id: "burst", content: "恢复后最新版"});
  const pageShow = () => Object.assign(new Event("pageshow"), {persisted: true});
  for (let i = 0; i < 20; i++) {
    h.realtime.emitServerEvent("connect");
    h.realtime.emitServerEvent("publication.updated");
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(pageShow());
  }
  await eventually(() => assert.equal(screen.feed[0]?.id, "burst"));
  const reads = () => h.requests.filter(req => req.path === "/api/v2/classroom-screens/feed").length;
  assert.equal(reads(), 1);
  h.realtime.emitServerEvent("publication.updated");
  screen.stopRealtime();
  window.dispatchEvent(pageShow());
  window.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("online"));
  h.realtime.emitServerEvent("connect");
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(reads(), 1);
});

test("background or offline lifecycle events do not refresh, while page-cache restoration does", async () => {
  const screen = h.newStore({screen: true});
  screen.startRealtime();
  const restored = () => window.dispatchEvent(Object.assign(new Event("pageshow"), {persisted: true}));
  document.visibilityState = "hidden";
  window.dispatchEvent(new Event("online"));
  restored();
  document.visibilityState = "visible";
  navigator.onLine = false;
  window.dispatchEvent(new Event("visibilitychange"));
  restored();
  navigator.onLine = true;
  window.dispatchEvent(Object.assign(new Event("pageshow"), {persisted: false}));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(h.requests.length, 0);
  h.publications.push({id: "restored", content: "页面恢复最新版"});
  restored();
  await eventually(() => assert.equal(screen.feed[0]?.id, "restored"));
});

test("thirty initializations keep one set of timers over a simulated day and clean them on stop", async (t) => {
  const screen = h.newStore({screen: true});
  const timers = new Map();
  let nextId = 0;
  let now = 0;
  const interval = (callback, delay) => {
    const id = ++nextId;
    timers.set(id, {callback, delay, next: now + delay});
    return id;
  };
  const clear = id => timers.delete(id);
  t.mock.method(globalThis, "setInterval", interval);
  t.mock.method(globalThis, "clearInterval", clear);
  t.mock.method(window, "setInterval", interval);
  t.mock.method(window, "clearInterval", clear);
  const feed = t.mock.method(screen, "loadActiveFeed", async () => {});
  const heartbeat = t.mock.method(screen, "sendScreenHeartbeat", async () => {});
  const upload = t.mock.method(screen, "flushScreenPublicationQueue", async () => {});
  try {
    for (let i = 0; i < 30; i++) { screen.startRealtime(); screen.initializeScreenSync(); }
    assert.equal(timers.size, 2);
    feed.mock.resetCalls(); heartbeat.mock.resetCalls(); upload.mock.resetCalls();
    // Advance timer deadlines, not the wall clock or HTTP transport. This catches
    // accumulated interval registrations without claiming 24 hours of real uptime.
    const end = 24 * 60 * 60 * 1000;
    while (true) {
      const timer = [...timers.values()].sort((a, b) => a.next - b.next)[0];
      if (!timer || timer.next > end) break;
      now = timer.next;
      timer.next += timer.delay;
      await timer.callback();
    }
    assert.equal(feed.mock.callCount(), 288);
    assert.equal(heartbeat.mock.callCount(), 1440);
    assert.equal(upload.mock.callCount(), 0);
    screen.stopRealtime(); screen.stopScreenSync();
    assert.equal(timers.size, 0);
    h.realtime.emitServerEvent("connect");
    h.realtime.emitServerEvent("publication.created");
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("visibilitychange"));
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(feed.mock.callCount(), 288);
    assert.equal(heartbeat.mock.callCount(), 1440);
    assert.equal(upload.mock.callCount(), 0);
  } finally { screen.stopRealtime(); screen.stopScreenSync(); }
});
