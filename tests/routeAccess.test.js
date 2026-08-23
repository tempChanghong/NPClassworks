import test from "node:test";
import assert from "node:assert/strict";
import {isDevelopmentOnlyPath, isRetiredClassworksPath} from "../src/utils/routeAccess.js";

test("production-only route guard recognizes every diagnostics page", () => {
  assert.equal(isDevelopmentOnlyPath("/debug"), true);
  assert.equal(isDevelopmentOnlyPath("/debug/visitor"), true);
  assert.equal(isDevelopmentOnlyPath("/socket-debugger"), true);
});

test("ordinary application routes are not treated as diagnostics pages", () => {
  assert.equal(isDevelopmentOnlyPath("/"), false);
  assert.equal(isDevelopmentOnlyPath("/setup"), false);
  assert.equal(isDevelopmentOnlyPath("/classworks-admin"), false);
  assert.equal(isDevelopmentOnlyPath("/debugging-notes"), false);
});

test("retired Classworks 1 routes return to the current home instead of rendering blank", () => {
  for (const path of [
    "/authorize",
    "/authorizecallback",
    "/CacheManagement",
    "/cses2wakeup",
    "/debug-init",
    "/debug-socket",
    "/list",
    "/list/old-uuid",
  ]) {
    assert.equal(isRetiredClassworksPath(path), true, path);
  }
  assert.equal(isRetiredClassworksPath("/classworks-admin"), false);
  assert.equal(isRetiredClassworksPath("/settings"), false);
});
