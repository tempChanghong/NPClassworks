import assert from "node:assert/strict";
import test from "node:test";
import {databaseUrl} from "./fullstack/environment.js";

test("fullstack harness only accepts explicitly named loopback test databases", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    const url = `postgresql://test:example@${host}:55434/npclassworks_test_fullstack?schema=public`;
    assert.equal(databaseUrl(url), url);
  }
  assert.ok(databaseUrl("postgres://localhost/npclassworks_test_fullstack_123"));
  for (const url of [undefined, "", "postgresql://example.com/npclassworks_test_fullstack",
    "postgresql://localhost/production", "postgresql://localhost/npclassworks_test",
    "https://localhost/npclassworks_test_fullstack",
    "postgresql://localhost/npclassworks_test_fullstack?host=example.com",
    "postgresql://localhost/npclassworks_test_fullstack?schema=production",
    "postgresql://localhost/npclassworks_test_fullstack?schema=public&schema=production",
  ]) assert.throws(() => databaseUrl(url));
});
