import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalDiagnostics,
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
});
