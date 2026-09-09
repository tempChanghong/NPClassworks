import assert from "node:assert/strict";
import test from "node:test";
import {createNoiseMonitoringController, MANUAL_NOISE_LIMIT_MS as LIMIT} from "../src/utils/noiseMonitoringController.js";

function fixture() {
  let wall = 1_000_000;
  let monotonic = 0;
  const timers = new Map();
  const listeners = new Set();
  const context = {bindingId: "a", scopeKey: "a:1", enabled: true, scheduleKey: "", endTime: "21:30"};
  const service = {status: "paused", starts: 0, stops: 0,
    start() { this.starts++; this.status = "active"; listeners.forEach(fn => fn()); },
    stop() { this.stops++; this.status = "paused"; listeners.forEach(fn => fn()); },
    subscribe(fn) { listeners.add(fn); fn(); return () => listeners.delete(fn); },
  };
  const controller = createNoiseMonitoringController(service, {now: () => wall, monotonicNow: () => monotonic,
    schedule: (fn, delay) => { const key = {}; timers.set(key, {fn: () => { timers.delete(key); fn(); }, delay}); return key; },
    cancel: key => timers.delete(key)});
  const detach = controller.attach(() => ({...context}));
  return {controller, service, context, timers, detach,
    advance(ms, wallMs = ms) { wall += wallMs; monotonic += ms; },
  };
}

test("manual monitoring lasts across subscribers and repeated start never extends its three-hour deadline", () => {
  const f = fixture();
  f.controller.startManual("a");
  const deadline = f.controller.snapshot().manualEndsAt;
  const unsubscribe = f.controller.subscribe(() => {});
  unsubscribe();
  f.advance(LIMIT - 1); f.controller.tick(); f.controller.startManual("a");
  assert.equal(f.service.starts, 1);
  assert.equal(f.controller.snapshot().manualEndsAt, deadline);
  assert.equal(f.service.status, "active");
  f.advance(1); [...f.timers.values()][0].fn();
  assert.equal(f.service.status, "paused");
  assert.equal(f.controller.snapshot().manualExpired, true);
  assert.equal(f.controller.snapshot().manualActive, false);
  assert.equal(f.timers.size, 0);
  f.detach();
});

test("the sample guard enforces expiry even when the timer was delayed or wall time moved backwards", () => {
  for (const rollback of [false, true]) {
    const f = fixture(); f.controller.startManual("a");
    f.advance(LIMIT, rollback ? -1000 : LIMIT);
    f.service.activityGuard();
    assert.equal(f.service.status, "paused");
    assert.equal(f.controller.snapshot().manualExpired, true);
    f.detach();
  }
});

test("manual and scheduled requests share one stream and ending either source preserves the other", () => {
  const f = fixture(); f.controller.startManual("a");
  f.context.scheduleKey = "today"; f.controller.tick();
  assert.equal(f.service.starts, 1);
  f.context.scheduleKey = ""; f.controller.tick();
  assert.equal(f.service.status, "active");
  f.context.scheduleKey = "today"; f.controller.tick();
  f.controller.stopManual();
  assert.equal(f.service.status, "active");
  assert.equal(f.controller.snapshot().manualActive, false);
  f.context.scheduleKey = ""; f.controller.tick();
  assert.equal(f.service.status, "paused");
  f.detach();
});

test("after three hours only a still-active schedule can keep the microphone running", () => {
  const f = fixture(); f.context.scheduleKey = "today"; f.controller.tick();
  f.controller.startManual("a"); f.advance(LIMIT); f.controller.tick();
  assert.equal(f.service.status, "active");
  assert.equal(f.service.starts, 1);
  assert.equal(f.controller.snapshot().manualExpired, true);
  assert.equal(f.controller.snapshot().manualActive, false);
  f.context.scheduleKey = ""; f.controller.tick();
  assert.equal(f.service.status, "paused");
  f.detach();
});

test("disabled tools, changed credentials and app teardown release manual ownership", () => {
  for (const operation of ["disable", "credentials", "binding", "detach"]) {
    const f = fixture(); f.controller.startManual("a");
    if (operation === "disable") f.context.enabled = false;
    if (operation === "credentials") f.context.scopeKey = "a:2";
    if (operation === "binding") { f.context.bindingId = "b"; f.context.scopeKey = "b:1"; }
    if (operation === "detach") f.detach();
    else f.controller.tick();
    assert.equal(f.service.status, "paused");
    assert.equal(f.controller.snapshot().manualActive, false);
    assert.equal(f.timers.size, 0);
    assert.equal(f.controller.startManual("a"), operation === "credentials");
    f.detach();
  }
});

test("manual failures do not repeatedly restart on periodic evaluations", () => {
  const f = fixture(); f.controller.startManual("a");
  f.service.status = "permission-denied";
  f.controller.tick(); f.controller.tick();
  assert.equal(f.service.starts, 1);
  f.controller.startManual("a");
  assert.equal(f.service.starts, 2);
  f.detach();
});
