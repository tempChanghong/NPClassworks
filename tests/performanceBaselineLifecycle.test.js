import assert from "node:assert/strict";
import test from "node:test";
import {startPerformanceBaseline} from "../src/utils/performanceBaseline.js";
import {clearLocalDiagnostics, getLocalDiagnostics} from "../src/utils/localDiagnostics.js";

test("browser lifecycle handlers reset sampling and filter delayed background long tasks", (t) => {
  const descriptors = new Map(["window", "document", "navigator", "performance", "PerformanceObserver"]
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let now = 0;
  const timers = new Map();
  const observers = new Map();
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const win = Object.assign(new globalThis.EventTarget(), {
    localStorage: storage, CustomEvent: globalThis.CustomEvent, screen: {width: 1920, height: 1080},
    setInterval: (callback, delay) => timers.set(delay, callback),
  });
  const doc = Object.assign(new globalThis.EventTarget(), {visibilityState: "visible", readyState: "loading"});
  for (const [key, value] of Object.entries({
    window: win, document: doc, navigator: {onLine: true},
    performance: {now: () => now, getEntriesByType: () => []},
    PerformanceObserver: class {
      constructor(callback) { this.callback = callback; }
      observe({type}) { observers.set(type, this.callback); }
    },
  })) Object.defineProperty(globalThis, key, {value, configurable: true});
  t.after(() => {
    clearLocalDiagnostics(storage);
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const dispatch = (target, type) => target.dispatchEvent(new globalThis.Event(type));
  const longTask = (startTime, duration) => observers.get("longtask")({getEntries: () => [{startTime, duration}]});
  startPerformanceBaseline();
  longTask(1, 100);
  now = 30200;
  timers.get(30000)();
  doc.visibilityState = "hidden";
  dispatch(doc, "visibilitychange");
  now += 8 * 60 * 60 * 1000;
  timers.get(30000)();
  doc.visibilityState = "visible";
  dispatch(doc, "visibilitychange");
  longTask(50000, 999999);
  longTask(now + 1, 200);
  dispatch(doc, "freeze");
  now += 60 * 60 * 1000;
  timers.get(30000)();
  dispatch(doc, "resume");
  dispatch(win, "pagehide");
  now += 60 * 60 * 1000;
  dispatch(win, "pageshow");
  now += 30000;
  timers.get(30000)();
  timers.get(15 * 60 * 1000)();
  const sample = getLocalDiagnostics(storage).snapshots.performanceBaseline.value.samples.at(-1);
  assert.deepEqual(sample.eventLoopDrift, {samples: 2, averageMs: 100, maxMs: 200});
  assert.deepEqual(sample.longTasks, {count: 2, totalMs: 300, maxMs: 200});
  assert.equal(sample.background.pauses, 3);
  assert.equal(sample.samplingGaps.count, 0);
  // 页面隐藏时生成的最后一份性能样本已经落盘，不依赖被节流的计时器。
  assert.equal(JSON.parse(storage.getItem("npclassworks-local-diagnostics:v1"))
    .snapshots.performanceBaseline.value.samples.at(-1).reason, "hidden");
});
