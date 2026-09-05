import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const viteConfig = readFileSync(new URL("../vite.config.mjs", import.meta.url), "utf8");
const cacheManager = readFileSync(new URL("../public/sw-cache-manager.js", import.meta.url), "utf8");
const customWorker = readFileSync(new URL("../src/sw.js", import.meta.url), "utf8");
const apiClient = readFileSync(new URL("../src/utils/classworksV2Client.js", import.meta.url), "utf8");

test("service worker keeps backend namespaces network-only across origins", () => {
  assert.match(viteConfig, /handler:\s*['"]NetworkOnly['"]/);
  assert.match(
    viteConfig,
    /runtimeCaching:\s*\[\s*\{[\s\S]*?urlPattern:\s*\(\{\s*url\s*\}\)\s*=>[\s\S]*?handler:\s*['"]NetworkOnly['"]/,
  );
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
  assert.match(customWorker, /new NetworkOnly\(\)/);
  assert.match(customWorker, /!isBackendRequest\(url\)/);
});

test("service worker upgrade removes retired caches and preserves offline user data", async () => {
  const listeners = new Map();
  const remaining = new Set(["external-resources", "uaf-cache", "sound-cache", "user-offline-data"]);
  runInNewContext(cacheManager, {
    self: {addEventListener: (event, handler) => listeners.set(event, handler)},
    caches: {delete: async (name) => remaining.delete(name)},
    console: {log() {}},
  });
  let activation;
  listeners.get("activate")({waitUntil: (promise) => { activation = promise; }});
  await activation;
  assert.deepEqual([...remaining], ["sound-cache", "user-offline-data"]);
});

test("school management permission discovery bypasses pre-upgrade caches", () => {
  assert.match(apiClient, /\/api\/v2\/me\/schools[\s\S]*?_permissionsAt:\s*Date\.now\(\)/);
});
