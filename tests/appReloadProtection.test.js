import test from "node:test";
import assert from "node:assert/strict";
import {registerAppReloadBlocker, appReloadBlockReason, requestAppReload, installAppReloadProtection} from "../src/utils/appReloadProtection.js";
import {withBrowserStorageLock} from "../src/utils/browserStorageLock.js";
import {createBrowserLocks} from "./helpers/browserLocks.js";

test("reload and native navigation consult live editing state and release on unmount", () => {
  let busy = true, reloads = 0;
  const release = registerAppReloadBlocker(() => busy && "正在保存");
  const location = {reload() { reloads++; }};
  const window = new globalThis.EventTarget();
  const uninstall = installAppReloadProtection(window);
  try {
    assert.equal(requestAppReload(location), "正在保存");
    assert.equal(reloads, 0);
    const event = new globalThis.Event("beforeunload", {cancelable: true});
    window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    busy = false;
    assert.equal(requestAppReload(location), "");
    assert.equal(reloads, 1);
    busy = true; release();
    assert.equal(appReloadBlockReason(), "");
  } finally { release(); uninstall(); }
});

test("a failing editor check prevents reload instead of assuming all input is saved", () => {
  const release = registerAppReloadBlocker(() => { throw new Error("lost state"); });
  try { assert.match(appReloadBlockReason(), /无法确认/); }
  finally { release(); }
});

test("storage mutex encloses the entire awaited operation and missing coordination fails closed", async () => {
  const locks = createBrowserLocks(), events = [];
  let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  const first = withBrowserStorageLock("queue", async () => { events.push("first-read"); await gate; events.push("first-write"); }, locks);
  const second = withBrowserStorageLock("queue", () => { events.push("second-read-write"); }, locks);
  await Promise.resolve();
  assert.deepEqual(events, ["first-read"]);
  resume(); await Promise.all([first, second]);
  assert.deepEqual(events, ["first-read", "first-write", "second-read-write"]);
  await assert.rejects(withBrowserStorageLock("queue", () => assert.fail("must not write"), {}), {code: "SCREEN_STORAGE_LOCK_UNAVAILABLE"});
});
