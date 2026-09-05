import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalDiagnostics,
  clearLocalDiagnostics,
  flushDiagnosticSnapshots,
  installLocalDiagnostics,
  recordDiagnosticEvent,
  recordDiagnosticSnapshot,
  sanitizeDiagnosticEndpoint,
  sanitizeDiagnosticValue,
} from "../src/utils/localDiagnostics.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("diagnostic records are bounded, deduplicated and expire", () => {
  const storage = memoryStorage();
  const now = Date.parse("2026-09-04T08:00:00.000Z");
  const event = {category: "API", code: "HTTP_503", message: "服务暂不可用"};
  recordDiagnosticEvent(event, {storage, now});
  recordDiagnosticEvent(event, {storage, now: now + 1000});

  const current = getLocalDiagnostics(storage, now + 2000);
  assert.equal(current.events.length, 1);
  assert.equal(current.events[0].count, 2);
  assert.equal(getLocalDiagnostics(storage, now + 8 * 24 * 60 * 60 * 1000).events.length, 0);
});

test("diagnostic values remove credentials and identifying strings", () => {
  const sanitized = sanitizeDiagnosticValue({
    authorization: "Bearer abc",
    pin: "1234",
    message: "teacher@example.com failed for 784e0f28-a0d2-4e10-9acc-9bf527d829a0",
  });
  assert.equal(sanitized.authorization, "[redacted]");
  assert.equal(sanitized.pin, "[redacted]");
  assert.equal(sanitized.message, "[email] failed for [id]");
  assert.equal(
    sanitizeDiagnosticEndpoint("https://api.example.test/api/v2/publications/784e0f28-a0d2-4e10-9acc-9bf527d829a0?token=secret"),
    "/api/v2/publications/[id]",
  );
});

test("diagnostic snapshots store only sanitized state", () => {
  const storage = memoryStorage();
  recordDiagnosticSnapshot("screenSync", {state: "offline", accessToken: "secret"}, {storage, now: 1000});
  const snapshot = getLocalDiagnostics(storage, 1000).snapshots.screenSync;
  assert.equal(snapshot.value.state, "offline");
  assert.equal(snapshot.value.accessToken, "[redacted]");
  clearLocalDiagnostics(storage);
});

test("snapshot bursts perform one read/write and retain latest values per name", () => {
  const storage = memoryStorage();
  let reads = 0;
  let writes = 0;
  const get = storage.getItem;
  const set = storage.setItem;
  storage.getItem = (key) => { reads++; return get(key); };
  storage.setItem = (key, value) => { writes++; set(key, value); };
  for (let i = 0; i < 1000; i++) recordDiagnosticSnapshot("screenSync", {sequence: i}, {storage});
  recordDiagnosticSnapshot("notificationDelivery", {status: "waiting"}, {storage});
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  flushDiagnosticSnapshots(storage);
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  const state = getLocalDiagnostics(storage);
  assert.equal(state.snapshots.screenSync.value.sequence, 999);
  assert.equal(state.snapshots.notificationDelivery.value.status, "waiting");
});

test("critical events synchronously persist pending snapshots without losing existing records", () => {
  const storage = memoryStorage();
  recordDiagnosticEvent({code: "EARLIER"}, {storage});
  recordDiagnosticSnapshot("screenSync", {pending: 2}, {storage});
  recordDiagnosticEvent({severity: "ERROR", code: "CRITICAL"}, {storage});
  const persisted = JSON.parse(storage.getItem("npclassworks-local-diagnostics:v1"));
  assert.deepEqual(persisted.events.map((event) => event.code), ["EARLIER", "CRITICAL"]);
  assert.equal(persisted.snapshots.screenSync.value.pending, 2);
});

test("snapshot window is bounded from the first update and clear prevents resurrection", (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const storage = memoryStorage();
  recordDiagnosticSnapshot("sync", {sequence: 1}, {storage});
  t.mock.timers.tick(900);
  recordDiagnosticSnapshot("sync", {sequence: 2}, {storage});
  assert.equal(storage.getItem("npclassworks-local-diagnostics:v1"), null);
  t.mock.timers.tick(100);
  assert.equal(JSON.parse(storage.getItem("npclassworks-local-diagnostics:v1")).snapshots.sync.value.sequence, 2);
  recordDiagnosticSnapshot("sync", {sequence: 3}, {storage});
  clearLocalDiagnostics(storage);
  t.mock.timers.tick(1000);
  assert.equal(storage.getItem("npclassworks-local-diagnostics:v1"), null);
  assert.deepEqual(getLocalDiagnostics(storage).snapshots, {});
});

test("batch storage failure does not escape or repeatedly schedule writes", (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  let writes = 0;
  const storage = {getItem: () => null, setItem: () => { writes++; throw new Error("QuotaExceededError"); }};
  recordDiagnosticSnapshot("sync", {pending: 2}, {storage});
  assert.doesNotThrow(() => t.mock.timers.tick(1000));
  t.mock.timers.tick(10000);
  assert.equal(writes, 1);
  assert.doesNotThrow(() => recordDiagnosticEvent({severity: "ERROR"}, {storage}));
});

test("hide and pagehide flush snapshots, and denied storage access is harmless", (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const storage = memoryStorage();
  const win = Object.assign(new globalThis.EventTarget(), {localStorage: storage, CustomEvent});
  const doc = Object.assign(new globalThis.EventTarget(), {visibilityState: "visible"});
  Object.defineProperty(globalThis, "window", {value: win, configurable: true});
  Object.defineProperty(globalThis, "document", {value: doc, configurable: true});
  t.after(() => {
    clearLocalDiagnostics(storage);
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  });
  installLocalDiagnostics({config: {}});
  recordDiagnosticSnapshot("sync", {sequence: 1});
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new globalThis.Event("visibilitychange"));
  assert.equal(JSON.parse(storage.getItem("npclassworks-local-diagnostics:v1")).snapshots.sync.value.sequence, 1);
  recordDiagnosticSnapshot("sync", {sequence: 2});
  win.dispatchEvent(new globalThis.Event("pagehide"));
  assert.equal(JSON.parse(storage.getItem("npclassworks-local-diagnostics:v1")).snapshots.sync.value.sequence, 2);
  Object.defineProperty(win, "localStorage", {get() { throw new Error("denied"); }});
  assert.doesNotThrow(() => recordDiagnosticSnapshot("sync", {}));
  assert.doesNotThrow(() => recordDiagnosticEvent({code: "ERROR"}));
});
