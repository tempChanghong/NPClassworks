import test from "node:test";
import assert from "node:assert/strict";
import {createBrowserLocks} from "./helpers/browserLocks.js";

test("abandoned draft recovery rereads under ownership lock and preserves the latest final save", async t => {
  const values = new Map(), tabValues = new Map();
  const memory = values => ({
    get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  });
  const storage = memory(values), tabs = memory(tabValues), locks = createBrowserLocks();
  const base = "classworks-v2-screen-homework-draft:screen:new";
  storage.setItem(base + ":tab:old", JSON.stringify({content: "被发现时的旧内容", updatedAt: Date.now()}));
  const wrappedLocks = {request(name, options, callback) {
    if (name === "classworks-draft-tab:old") {
      storage.setItem(base + ":tab:old", JSON.stringify({content: "关闭前最后一次保存", updatedAt: Date.now()}));
    }
    return locks.request(name, options, callback);
  }};
  for (const [key, value] of Object.entries({localStorage: storage, sessionStorage: tabs, navigator: {locks: wrappedLocks}})) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {configurable: true, value});
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
  }
  const {openScreenDraftStorage} = await import("../src/utils/screenDraftSession.js");
  const owned = await openScreenDraftStorage("screen", "new");
  assert.equal(JSON.parse(owned.getItem(base)).content, "关闭前最后一次保存");
  assert.equal(storage.getItem(base + ":tab:old"), null);
});
