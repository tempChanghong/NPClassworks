import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const viteConfig = readFileSync(new URL("../vite.config.mjs", import.meta.url), "utf8");

test("service worker keeps every same-origin backend namespace network-only", () => {
  assert.match(viteConfig, /handler:\s*['"]NetworkOnly['"]/);
  for (const prefix of [
    "/api/",
    "/accounts/",
    "/kv/",
    "/apps/",
    "/devices/",
    "/auth/",
    "/auto-auth/",
    "/socket.io/",
  ]) {
    assert.ok(viteConfig.includes(`'${prefix}'`), `missing backend cache exclusion: ${prefix}`);
  }
  for (const exactPath of ["/metrics", "/check", "/ready"]) {
    assert.ok(viteConfig.includes(`'${exactPath}'`), `missing backend cache exclusion: ${exactPath}`);
  }
});
