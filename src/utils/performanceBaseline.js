import {getLocalDiagnostics, recordDiagnosticSnapshot} from "./localDiagnostics.js";

const SNAPSHOT_NAME = "performanceBaseline";
const MAX_SAMPLES = 48;
let started = false;
let startedAt = 0;
let appMountedAt = 0;
let lcp = 0;
let fcp = 0;
let longTaskCount = 0;
let longTaskTotal = 0;
let longTaskMax = 0;
let driftCount = 0;
let driftTotal = 0;
let driftMax = 0;

export function summarizeNavigationTiming(entry) {
  if (!entry) return null;
  return {
    ttfbMs: Math.max(0, Math.round(entry.responseStart - entry.startTime)),
    domContentLoadedMs: Math.max(0, Math.round(entry.domContentLoadedEventEnd - entry.startTime)),
    loadMs: Math.max(0, Math.round(entry.loadEventEnd - entry.startTime)),
    transferBytes: Math.max(0, Number(entry.transferSize) || 0),
    encodedBytes: Math.max(0, Number(entry.encodedBodySize) || 0),
  };
}

export function appendPerformanceSample(samples, sample, maximum = MAX_SAMPLES) {
  return [...(Array.isArray(samples) ? samples : []), sample].slice(-maximum);
}

function rounded(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function collectSample(reason) {
  if (typeof window === "undefined") return;
  const navigation = globalThis.performance.getEntriesByType?.("navigation")?.[0];
  const memory = globalThis.performance.memory;
  const connection = navigator.connection;
  const previous = getLocalDiagnostics().snapshots?.[SNAPSHOT_NAME]?.value;
  const sample = {
    at: new Date().toISOString(),
    reason,
    uptimeMinutes: rounded((globalThis.performance.now() - startedAt) / 60000),
    appMountedMs: appMountedAt ? Math.round(appMountedAt - startedAt) : null,
    firstContentfulPaintMs: Math.round(fcp),
    largestContentfulPaintMs: Math.round(lcp),
    navigation: summarizeNavigationTiming(navigation),
    longTasks: {count: longTaskCount, totalMs: rounded(longTaskTotal), maxMs: rounded(longTaskMax)},
    eventLoopDrift: {samples: driftCount, averageMs: driftCount ? rounded(driftTotal / driftCount) : 0, maxMs: rounded(driftMax)},
    memory: memory ? {
      usedMb: rounded(memory.usedJSHeapSize / 1024 / 1024),
      totalMb: rounded(memory.totalJSHeapSize / 1024 / 1024),
      limitMb: rounded(memory.jsHeapSizeLimit / 1024 / 1024),
    } : null,
    network: connection ? {
      effectiveType: connection.effectiveType || "",
      downlinkMbps: connection.downlink || 0,
      rttMs: connection.rtt || 0,
      saveData: Boolean(connection.saveData),
    } : null,
    online: navigator.onLine,
    visibility: document.visibilityState,
  };
  recordDiagnosticSnapshot(SNAPSHOT_NAME, {
    device: {
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemoryGb: navigator.deviceMemory || null,
      display: {width: window.screen.width, height: window.screen.height, pixelRatio: globalThis.devicePixelRatio || 1},
    },
    samples: appendPerformanceSample(previous?.samples, sample),
  });
}

function observe(type, handler) {
  try {
    const observer = new globalThis.PerformanceObserver((list) => handler(list.getEntries()));
    observer.observe({type, buffered: true});
  } catch {
    // 浏览器不支持该性能指标时，保留其他可用指标。
  }
}

export function markApplicationMounted() {
  appMountedAt = typeof globalThis.performance === "undefined" ? Date.now() : globalThis.performance.now();
  globalThis.queueMicrotask(() => collectSample("app-mounted"));
}

export function startPerformanceBaseline() {
  if (started || typeof window === "undefined" || typeof globalThis.performance === "undefined") return;
  started = true;
  startedAt = globalThis.performance.now();
  fcp = globalThis.performance.getEntriesByName?.("first-contentful-paint")?.[0]?.startTime || 0;
  observe("paint", (entries) => {
    fcp = entries.find((entry) => entry.name === "first-contentful-paint")?.startTime || fcp;
  });
  observe("largest-contentful-paint", (entries) => {
    lcp = entries.at(-1)?.startTime || lcp;
  });
  observe("longtask", (entries) => {
    for (const entry of entries) {
      longTaskCount += 1;
      longTaskTotal += entry.duration;
      longTaskMax = Math.max(longTaskMax, entry.duration);
    }
  });
  let expected = globalThis.performance.now() + 30000;
  window.setInterval(() => {
    const current = globalThis.performance.now();
    const drift = Math.max(0, current - expected);
    driftCount += 1;
    driftTotal += drift;
    driftMax = Math.max(driftMax, drift);
    expected = current + 30000;
  }, 30000);
  window.setInterval(() => collectSample("periodic"), 15 * 60 * 1000);
  const collectInitialSettledSample = () => window.setTimeout(() => collectSample("initial-settled"), 3000);
  if (document.readyState === "complete") collectInitialSettledSample();
  else window.addEventListener("load", collectInitialSettledSample, {once: true});
  window.addEventListener("online", () => collectSample("online"));
  window.addEventListener("offline", () => collectSample("offline"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") collectSample("hidden");
  });
}
