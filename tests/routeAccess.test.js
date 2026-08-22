import test from "node:test";
import assert from "node:assert/strict";
import {isDevelopmentOnlyPath, isLegacyClassworksPath} from "../src/utils/routeAccess.js";

test("production-only route guard recognizes every diagnostics page", () => {
  assert.equal(isDevelopmentOnlyPath("/debug"), true);
  assert.equal(isDevelopmentOnlyPath("/debug/visitor"), true);
  assert.equal(isDevelopmentOnlyPath("/debug-init"), true);
  assert.equal(isDevelopmentOnlyPath("/debug-socket"), true);
  assert.equal(isDevelopmentOnlyPath("/socket-debugger"), true);
});

test("ordinary application routes are not treated as diagnostics pages", () => {
  assert.equal(isDevelopmentOnlyPath("/"), false);
  assert.equal(isDevelopmentOnlyPath("/setup"), false);
  assert.equal(isDevelopmentOnlyPath("/classworks-admin"), false);
  assert.equal(isDevelopmentOnlyPath("/debugging-notes"), false);
});

test("Classworks 1 pages are recognized without blocking NPClassworks routes", () => {
  for (const path of ["/authorize", "/authorizecallback", "/CacheManagement", "/cses2wakeup", "/list", "/list/example"]) {
    assert.equal(isLegacyClassworksPath(path), true, path);
  }
  assert.equal(isLegacyClassworksPath("/"), false);
  assert.equal(isLegacyClassworksPath("/settings"), false);
  assert.equal(isLegacyClassworksPath("/classworks-admin"), false);
});
