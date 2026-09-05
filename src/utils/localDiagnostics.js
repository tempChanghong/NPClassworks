import {showAppRecovery} from "./appRecovery.js";

const STORAGE_KEY = "npclassworks-local-diagnostics:v1";
const EVENT_NAME = "npclassworks:diagnostics-updated";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 150;
const DEDUPLICATION_MS = 5 * 60 * 1000;
const SNAPSHOT_FLUSH_MS = 1000;
const pendingSnapshots = new WeakMap();
const SENSITIVE_KEY = /(authorization|cookie|credential|password|passphrase|pin|secret|setup.?key|token)/i;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LONG_SECRET_PATTERN = /\b[0-9a-f]{32,}\b/gi;

function storageOrNull(storage) {
  if (storage) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function emptyState() {
  return {version: 1, events: [], snapshots: {}};
}

export function sanitizeDiagnosticText(value) {
  return String(value ?? "")
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, "[user-home]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, "$1")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(UUID_PATTERN, "[id]")
    .replace(LONG_SECRET_PATTERN, "[secret]")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]")
    .slice(0, 1000);
}

export function sanitizeDiagnosticEndpoint(value) {
  const text = String(value || "");
  try {
    const url = new URL(text, "https://diagnostic.invalid");
    return sanitizeDiagnosticText(url.pathname)
      .replace(/\/[0-9a-z_-]{20,}(?=\/|$)/gi, "/[id]");
  } catch {
    return sanitizeDiagnosticText(text.split(/[?#]/)[0]);
  }
}

export function sanitizeDiagnosticValue(value, key = "", depth = 0, seen = new WeakSet()) {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return sanitizeDiagnosticText(value);
  if (depth >= 4) return "[truncated]";
  if (typeof value !== "object") return sanitizeDiagnosticText(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeDiagnosticValue(item, key, depth + 1, seen));
  }
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([childKey, childValue]) => [
    childKey,
    sanitizeDiagnosticValue(childValue, childKey, depth + 1, seen),
  ]));
}

function normalizeEvent(event, now) {
  return {
    at: new Date(now).toISOString(),
    lastAt: new Date(now).toISOString(),
    category: sanitizeDiagnosticText(event.category || "APP").slice(0, 40),
    severity: ["INFO", "WARNING", "ERROR"].includes(event.severity) ? event.severity : "WARNING",
    code: sanitizeDiagnosticText(event.code || "UNKNOWN").slice(0, 80),
    message: sanitizeDiagnosticText(event.message || "未提供错误信息"),
    count: 1,
    context: sanitizeDiagnosticValue(event.context || {}),
  };
}

function readState(storage, now = Date.now()) {
  const target = storageOrNull(storage);
  if (!target) return emptyState();
  try {
    const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "null");
    if (!parsed || parsed.version !== 1) return emptyState();
    const events = Array.isArray(parsed.events)
      ? parsed.events.filter((event) => Number.isFinite(Date.parse(event.at)) && now - Date.parse(event.at) <= RETENTION_MS)
      : [];
    return {version: 1, events: events.slice(-MAX_EVENTS), snapshots: parsed.snapshots && typeof parsed.snapshots === "object" ? parsed.snapshots : {}};
  } catch {
    return emptyState();
  }
}

function writeState(state, storage) {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(state));
    if (typeof window !== "undefined") window.dispatchEvent(new window.CustomEvent(EVENT_NAME));
  } catch {
    // 诊断记录不能影响正常业务。
  }
}

function takePendingSnapshots(storage) {
  const pending = storage && pendingSnapshots.get(storage);
  if (!pending) return {};
  clearTimeout(pending.timer);
  pendingSnapshots.delete(storage);
  return pending.values;
}

export function flushDiagnosticSnapshots(storage, now = Date.now()) {
  const target = storageOrNull(storage);
  if (!target || !pendingSnapshots.has(target)) return;
  const state = readState(target, now);
  Object.assign(state.snapshots, takePendingSnapshots(target));
  writeState(state, target);
}

export function recordDiagnosticEvent(event, {storage, now = Date.now()} = {}) {
  const target = storageOrNull(storage);
  const state = readState(target, now);
  Object.assign(state.snapshots, takePendingSnapshots(target));
  const next = normalizeEvent(event, now);
  const previous = state.events.slice().reverse().find((candidate) => (
    candidate.category === next.category
    && candidate.code === next.code
    && candidate.message === next.message
    && now - Date.parse(candidate.lastAt || candidate.at) <= DEDUPLICATION_MS
  ));
  if (previous) {
    previous.count = (Number(previous.count) || 1) + 1;
    previous.lastAt = next.lastAt;
    previous.context = next.context;
  } else {
    state.events.push(next);
  }
  state.events = state.events.slice(-MAX_EVENTS);
  writeState(state, target);
  return next;
}

export function recordDiagnosticSnapshot(name, value, {storage, now = Date.now()} = {}) {
  const target = storageOrNull(storage);
  if (!target) return;
  let pending = pendingSnapshots.get(target);
  if (!pending) {
    pending = {values: Object.create(null), timer: setTimeout(() => flushDiagnosticSnapshots(target), SNAPSHOT_FLUSH_MS)};
    pendingSnapshots.set(target, pending);
  }
  pending.values[sanitizeDiagnosticText(name).slice(0, 60)] = {
    updatedAt: new Date(now).toISOString(),
    value: sanitizeDiagnosticValue(value),
  };
}

export function getLocalDiagnostics(storage, now = Date.now()) {
  const target = storageOrNull(storage);
  const state = readState(target, now);
  Object.assign(state.snapshots, target && pendingSnapshots.get(target)?.values);
  return state;
}

export function clearLocalDiagnostics(storage) {
  const target = storageOrNull(storage);
  takePendingSnapshots(target);
  try {
    target?.removeItem(STORAGE_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new window.CustomEvent(EVENT_NAME));
  } catch {
    // 清理失败不影响管理页面。
  }
}

export function onLocalDiagnosticsChange(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export async function createDiagnosticBundle({app, backendUrl, managementOverview, context} = {}, storage) {
  let storageEstimate = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    storageEstimate = estimate ? {usage: estimate.usage || 0, quota: estimate.quota || 0} : null;
  } catch {
    storageEstimate = null;
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    privacy: "No credentials, request bodies, cookies, tokens or URL query strings are included.",
    app: sanitizeDiagnosticValue(app || {}),
    environment: {
      frontendOrigin: typeof window === "undefined" ? "" : window.location.origin,
      backendOrigin: (() => {
        try { return new URL(backendUrl || "", typeof window === "undefined" ? "https://diagnostic.invalid" : window.location.origin).origin; } catch { return ""; }
      })(),
      online: typeof navigator === "undefined" ? null : navigator.onLine,
      language: typeof navigator === "undefined" ? "" : navigator.language,
      userAgent: typeof navigator === "undefined" ? "" : sanitizeDiagnosticText(navigator.userAgent),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      visibility: typeof document === "undefined" ? "" : document.visibilityState,
      serviceWorkerControlled: typeof navigator === "undefined" ? false : Boolean(navigator.serviceWorker?.controller),
      display: typeof window === "undefined" ? null : {width: window.screen.width, height: window.screen.height, pixelRatio: globalThis.devicePixelRatio || 1},
      storageEstimate,
    },
    context: sanitizeDiagnosticValue(context || {}),
    local: getLocalDiagnostics(storage),
    managementOverview: sanitizeDiagnosticValue(managementOverview || null),
  };
}

export function downloadDiagnosticBundle(bundle, filename = "npclassworks-diagnostics.json") {
  const blob = new window.Blob([JSON.stringify(bundle, null, 2)], {type: "application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function installLocalDiagnostics(app) {
  const previousHandler = app.config.errorHandler;
  app.config.errorHandler = (error, instance, info) => {
    recordDiagnosticEvent({
      category: "APP",
      severity: "ERROR",
      code: "VUE_UNHANDLED_ERROR",
      message: error?.message || String(error),
      context: {component: instance?.$options?.name || "", info, stack: error?.stack || ""},
    });
    showAppRecovery({
      kind: "application",
      title: "页面组件运行失败",
      message: "当前页面没有正常完成运行，可以重新加载或下载诊断包。",
      detail: error?.message || String(error),
    });
    if (previousHandler) previousHandler(error, instance, info);
    else console.error(error);
  };
  if (typeof window === "undefined" || window.__NP_LOCAL_DIAGNOSTICS_INSTALLED__) return;
  window.__NP_LOCAL_DIAGNOSTICS_INSTALLED__ = true;
  window.addEventListener("pagehide", () => flushDiagnosticSnapshots());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDiagnosticSnapshots();
  });
  window.addEventListener("error", (event) => {
    const targetTag = event.target?.tagName?.toUpperCase?.() || "";
    const isCriticalResource = targetTag === "SCRIPT" || (targetTag === "LINK" && event.target?.rel === "stylesheet");
    recordDiagnosticEvent({
      category: "APP",
      severity: "ERROR",
      code: event.error ? "WINDOW_ERROR" : "RESOURCE_LOAD_ERROR",
      message: event.message || "页面资源载入失败",
      context: {source: event.filename || event.target?.src || event.target?.href || "", line: event.lineno || 0, column: event.colno || 0, stack: event.error?.stack || ""},
    });
    if (isCriticalResource) {
      showAppRecovery({
        kind: "resource",
        title: "新版页面资源载入失败",
        message: "脚本或样式文件没有完整载入，可以清理资源缓存后重新加载。",
        detail: event.target?.src || event.target?.href || "",
      });
    }
  }, true);
  window.addEventListener("unhandledrejection", (event) => recordDiagnosticEvent({
    category: "APP",
    severity: "ERROR",
    code: "UNHANDLED_PROMISE_REJECTION",
    message: event.reason?.message || String(event.reason || "Promise rejected"),
    context: {stack: event.reason?.stack || ""},
  }));
}
