import test from "node:test";
import assert from "node:assert/strict";
import {isDevelopmentOnlyPath} from "../src/utils/routeAccess.js";

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
