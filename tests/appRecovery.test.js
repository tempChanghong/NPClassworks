import assert from "node:assert/strict";
import test from "node:test";
import {clearApplicationResourceCaches, isApplicationResourceCache} from "../src/utils/appRecovery.js";

test("只识别可重新生成的应用资源缓存", () => {
  assert.equal(isApplicationResourceCache("workbox-precache-v2-https://newfires.top/"), true);
  assert.equal(isApplicationResourceCache("npclassworks-sound-cache"), true);
  assert.equal(isApplicationResourceCache("js-cache"), true);
  assert.equal(isApplicationResourceCache("user-offline-data"), false);
});

test("清理资源缓存时保留其他缓存", async () => {
  const deleted = [];
  const cacheStorage = {
    async keys() {
      return ["workbox-precache-v2", "other-resources", "user-offline-data"];
    },
    async delete(name) {
      deleted.push(name);
      return true;
    },
  };
  const cleared = await clearApplicationResourceCaches(cacheStorage);
  assert.deepEqual(cleared, ["workbox-precache-v2", "other-resources"]);
  assert.deepEqual(deleted, cleared);
});
