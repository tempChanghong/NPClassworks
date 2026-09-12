import {test, expect} from "@playwright/test";
import {readFile} from "node:fs/promises";

// Execute the production storage module with the real browser's IndexedDB,
// on an isolated page with no account, microphone, or production API requests.
test.beforeEach(async ({page}) => {
  const source = await readFile(new URL("../../src/utils/noiseHistoryStore.js", import.meta.url), "utf8");
  await page.route("**/__test/noise-history-store.js", route => route.fulfill({contentType: "text/javascript", body: source}));
  await page.route("**/__test/noise-history", route => route.fulfill({contentType: "text/html", body: "<!doctype html><title>Noise history test</title>"}));
  await page.goto("/__test/noise-history");
  await page.evaluate(async () => {
    window.historyModule = await import("/__test/noise-history-store.js");
    window.fixtureSlice = (id, end = Date.now()) => ({id, start: end - 30000, end, frames: 300, score: 80, display: {avgDb: 45, p95Db: 50}});
    window.historyStore = window.historyModule.createNoiseHistoryStore();
  });
});

test("noise history imports legacy data once and persists incremental writes across reload", async ({page}) => {
  expect(await page.evaluate(async () => {
    localStorage.setItem("noise-slices-v2", JSON.stringify([window.fixtureSlice("legacy")]));
    await window.historyStore.append(window.fixtureSlice("new"));
    return {ids: (await window.historyStore.read()).map(x => x.id), legacyRetained: Boolean(localStorage.getItem("noise-slices-v2"))};
  })).toEqual({ids: ["legacy", "new"], legacyRetained: true});
  await page.reload();
  expect(await page.evaluate(async () => {
    const {createNoiseHistoryStore} = await import("/__test/noise-history-store.js");
    return (await createNoiseHistoryStore().read()).map(x => x.id);
  })).toEqual(["legacy", "new"]);
});

test("a real blocked database open times out and its late upgrade cannot replace the recovered connection", async ({page}) => {
  expect(await page.evaluate(async () => {
    const name = "noise-open-timeout-test";
    const held = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open(name, 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    let blocked;
    const blockedEvent = new Promise(resolve => { blocked = resolve; });
    const removed = new Promise((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(name);
      request.onblocked = blocked; request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    await blockedEvent;
    const store = window.historyModule.createNoiseHistoryStore({databaseName: name, operationTimeoutMs: 1000});
    let message;
    try { await store.read(); } catch (error) { message = error.message; }
    held.close(); await removed;
    // This retry is queued behind the timed-out open. The old upgrade must abort.
    await store.append(window.fixtureSlice("recovered"));
    const ids = (await store.read()).map(item => item.id);
    await store.close();
    return {message, ids};
  })).toEqual({message: "噪声历史存储打开超时，请重试", ids: ["recovered"]});
});

test("a timed-out real write transaction is aborted before clear and later writes recover", async ({page}) => {
  expect(await page.evaluate(async () => {
    const store = window.historyModule.createNoiseHistoryStore({operationTimeoutMs: 1000});
    await store.append(window.fixtureSlice("saved"));
    const db = await new Promise(resolve => {
      const request = window.indexedDB.open("classworks-noise-history", 1);
      request.onsuccess = () => resolve(request.result);
    });
    const blocking = db.transaction("slices", "readwrite");
    let keepAlive = true;
    const pump = () => {
      if (keepAlive) blocking.objectStore("slices").get("saved").onsuccess = pump;
    };
    pump();
    let message;
    try { await store.append(window.fixtureSlice("must-not-commit")); } catch (error) { message = error.message; }
    const released = new Promise(resolve => { blocking.oncomplete = resolve; });
    keepAlive = false; await released; db.close();
    const before = (await store.read()).map(item => item.id);
    await store.clear();
    await store.append(window.fixtureSlice("after-clear", Date.now() + 1));
    const after = (await store.read()).map(item => item.id);
    await store.close();
    return {message, before, after};
  })).toEqual({message: "噪声历史存储超时，请重试", before: ["saved"], after: ["after-clear"]});
});

test("noise history bounds storage and cleans expired records without touching queued homework", async ({page}) => {
  expect(await page.evaluate(async () => {
    const now = Date.now();
    const rows = Array.from({length: 5000}, (_, i) => window.fixtureSlice(`row-${i}`, now - (5000 - i) * 30000));
    rows.unshift(window.fixtureSlice("expired", now - 15 * 86400000));
    localStorage.setItem("noise-slices-v2", JSON.stringify(rows));
    localStorage.setItem("classworks-v2-screen-publication-queue:test", "pending-homework");
    await window.historyStore.append(window.fixtureSlice("new", now));
    const history = await window.historyStore.read();
    const future = window.historyModule.createNoiseHistoryStore({now: () => now + 15 * 86400000});
    const expired = await future.read();
    await future.close();
    return {count: history.length, first: history[0].id, last: history.at(-1).id, expired: expired.length,
      queue: localStorage.getItem("classworks-v2-screen-publication-queue:test")};
  })).toEqual({count: 5000, first: "row-1", last: "new", expired: 0, queue: "pending-homework"});
});

test("two independent stores append concurrently and a clear cannot reimport legacy history", async ({page}) => {
  expect(await page.evaluate(async () => {
    const other = window.historyModule.createNoiseHistoryStore();
    const now = Date.now();
    await Promise.all(Array.from({length: 20}, (_, i) => (i % 2 ? other : window.historyStore).append(window.fixtureSlice(`row-${i}`, now + i))));
    const count = (await other.read()).length;
    // Even if removal of the old copy failed, committed migration metadata wins.
    localStorage.setItem("noise-slices-v2", JSON.stringify([window.fixtureSlice("stale")]));
    await other.clear(); await other.close(); await window.historyStore.close();
    const reopened = window.historyModule.createNoiseHistoryStore();
    const empty = await reopened.read();
    await reopened.append(window.fixtureSlice("after-clear", Date.now() + 1));
    return {count, empty, ids: (await reopened.read()).map(x => x.id)};
  })).toEqual({count: 20, empty: [], ids: ["after-clear"]});
});

test("aborted writes preserve saved history and a failed import retains its legacy source", async ({page}) => {
  expect(await page.evaluate(async () => {
    const slice = window.fixtureSlice("saved");
    await window.historyStore.append(slice);
    let failed = false;
    try { await window.historyStore.append({...window.fixtureSlice("invalid"), uncloneable: () => {}}); } catch { failed = true; }
    const ids = (await window.historyStore.read()).map(x => x.id);
    const unavailable = window.historyModule.createNoiseHistoryStore({databaseName: "noise-failed-import", storage: {
      getItem() { return "not json"; }, removeItem() { throw new Error("must not delete failed import"); },
    }});
    let importFailed = false;
    try { await unavailable.read(); } catch { importFailed = true; }
    return {failed, ids, importFailed};
  })).toEqual({failed: true, ids: ["saved"], importFailed: true});
});

test("legacy fallback remains available when IndexedDB is unsupported", async ({page}) => {
  expect(await page.evaluate(async () => {
    const store = window.historyModule.createNoiseHistoryStore({indexedDB: null});
    await store.append(window.fixtureSlice("fallback"));
    const ids = (await store.read()).map(x => x.id);
    await store.clear();
    return {ids, after: await store.read()};
  })).toEqual({ids: ["fallback"], after: []});
});

test("failed import writes retain the original source and can be retried", async ({page}) => {
  expect(await page.evaluate(async () => {
    const raw = JSON.stringify([window.fixtureSlice("legacy-retry")]);
    localStorage.setItem("noise-slices-v2", raw);
    const original = window.IDBObjectStore.prototype.put;
    window.IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "slices") throw new window.DOMException("Quota exceeded", "QuotaExceededError");
      return original.apply(this, args);
    };
    let failed = false;
    try { await window.historyStore.read(); } catch { failed = true; }
    finally { window.IDBObjectStore.prototype.put = original; }
    const retained = localStorage.getItem("noise-slices-v2") === raw;
    const ids = (await window.historyStore.read()).map(x => x.id);
    return {failed, retained, ids};
  })).toEqual({failed: true, retained: true, ids: ["legacy-retry"]});
});

test("an old page can keep recording after import and after the new page clears history", async ({page}) => {
  expect(await page.evaluate(async () => {
    const now = Date.now();
    const old = window.fixtureSlice("before-clear", now - 1000);
    localStorage.setItem("noise-slices-v2", JSON.stringify([old]));
    await window.historyStore.read();
    const late = window.fixtureSlice("late-old-page", now);
    localStorage.setItem("noise-slices-v2", JSON.stringify([old, late]));
    const before = (await window.historyStore.read()).map(x => x.id);
    await window.historyStore.clear(); await window.historyStore.close();
    const newest = window.fixtureSlice("after-clear", Date.now() + 1000);
    // Simulate the old page rewriting its cached array, including cleared rows.
    localStorage.setItem("noise-slices-v2", JSON.stringify([old, late, newest]));
    const reopened = window.historyModule.createNoiseHistoryStore();
    const after = (await reopened.read()).map(x => x.id);
    return {before, after};
  })).toEqual({before: ["before-clear", "late-old-page"], after: ["after-clear"]});
});

test("a legacy write during import commit is picked up by the next read", async ({page}) => {
  expect(await page.evaluate(async () => {
    const first = window.fixtureSlice("first", Date.now() - 1000);
    const late = window.fixtureSlice("during-import");
    let raw = JSON.stringify([first]);
    let reads = 0;
    const storage = {getItem() {
      if (++reads === 2) raw = JSON.stringify([first, late]);
      return raw;
    }, removeItem() { throw new Error("must not delete a concurrent legacy write"); }};
    const store = window.historyModule.createNoiseHistoryStore({storage});
    await store.read();
    await store.read();
    return (await store.read()).map(x => x.id);
  })).toEqual(["first", "during-import"]);
});

test("an actual second page using the old format continues importing without resurrecting cleared rows", async ({page, context}) => {
  const oldPage = await context.newPage();
  await oldPage.route("**/__test/old-noise", route => route.fulfill({contentType: "text/html", body: "<!doctype html><title>Old noise page</title>"}));
  await oldPage.goto("/__test/old-noise");
  await oldPage.evaluate(() => {
    window.cachedNoise = [{id: "old-page-a", start: Date.now() - 30000, end: Date.now() - 1000}];
    localStorage.setItem("noise-slices-v2", JSON.stringify(window.cachedNoise));
  });
  expect(await page.evaluate(async () => (await window.historyStore.read()).map(x => x.id))).toEqual(["old-page-a"]);
  await oldPage.evaluate(() => {
    window.cachedNoise.push({id: "old-page-b", start: Date.now() - 30000, end: Date.now()});
    localStorage.setItem("noise-slices-v2", JSON.stringify(window.cachedNoise));
  });
  expect(await page.evaluate(async () => (await window.historyStore.read()).map(x => x.id))).toEqual(["old-page-a", "old-page-b"]);
  await page.evaluate(() => window.historyStore.clear());
  await oldPage.evaluate(() => {
    window.cachedNoise.push({id: "old-page-c", start: Date.now() - 30000, end: Date.now() + 1});
    localStorage.setItem("noise-slices-v2", JSON.stringify(window.cachedNoise));
  });
  expect(await page.evaluate(async () => (await window.historyStore.read()).map(x => x.id))).toEqual(["old-page-c"]);
  await oldPage.close();
});
