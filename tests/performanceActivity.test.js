import assert from "node:assert/strict";
import test from "node:test";
import {createPerformanceActivity} from "../src/utils/performanceActivity.js";

function harness(visible = true) {
  let monotonic = 0;
  let wall = 0;
  const activity = createPerformanceActivity({now: () => monotonic, wallNow: () => wall, visible});
  return {
    activity,
    advance(ms, wallMs = ms) { monotonic += ms; wall += wallMs; },
  };
}

test("foreground timer delay and actual long tasks remain measurable", () => {
  const h = harness();
  h.advance(30500);
  h.activity.tick();
  h.activity.longTask({startTime: 30000, duration: 500});
  h.advance(30000);
  h.activity.tick();
  assert.deepEqual(h.activity.snapshot().eventLoopDrift, {samples: 2, averageMs: 250, maxMs: 500});
  assert.deepEqual(h.activity.snapshot().longTasks, {count: 1, totalMs: 500, maxMs: 500});
});

test("24 hours of repeated background/wake cycles never inflate foreground drift", () => {
  const h = harness();
  for (let i = 0; i < 24; i++) {
    h.activity.pause();
    h.activity.pause();
    h.advance(60 * 60 * 1000);
    h.activity.tick();
    h.activity.longTask({startTime: 0, duration: 999999});
    h.activity.resume();
    // Observer 回调延迟到前台才交付的后台记录仍必须排除。
    h.activity.longTask({startTime: i * 60 * 60 * 1000, duration: 888888});
    h.advance(30000);
    h.activity.tick();
  }
  const sample = h.activity.snapshot();
  assert.equal(sample.eventLoopDrift.samples, 24);
  assert.equal(sample.eventLoopDrift.maxMs, 0);
  assert.equal(sample.longTasks.count, 0);
  assert.deepEqual(sample.background, {pauses: 24, totalMs: 24 * 60 * 60 * 1000});
});

test("unannounced sleep is an unclassified gap on both running and paused monotonic clocks", () => {
  for (const monotonicElapsed of [30000, 8 * 60 * 60 * 1000]) {
    const h = harness();
    h.advance(monotonicElapsed, 8 * 60 * 60 * 1000);
    h.activity.tick();
    h.activity.longTask({startTime: 100, duration: 200});
    h.advance(30020);
    h.activity.tick();
    const sample = h.activity.snapshot();
    assert.deepEqual(sample.samplingGaps, {count: 1, totalMs: 8 * 60 * 60 * 1000, maxMs: 8 * 60 * 60 * 1000});
    assert.deepEqual(sample.eventLoopDrift, {samples: 1, averageMs: 20, maxMs: 20});
    assert.equal(sample.background.pauses, 0);
    assert.equal(sample.longTasks.count, 1);
  }
});

test("a page initially hidden waits for foreground and resume resets the baseline", () => {
  const h = harness(false);
  h.advance(600000);
  h.activity.tick();
  assert.equal(h.activity.snapshot().eventLoopDrift.samples, 0);
  h.activity.resume();
  h.advance(600000);
  h.activity.resume();
  h.advance(30000);
  h.activity.tick();
  assert.equal(h.activity.snapshot().eventLoopDrift.maxMs, 0);
  assert.equal(h.activity.snapshot().background.totalMs, 600000);
});
