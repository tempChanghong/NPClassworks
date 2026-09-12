import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

const endpoint = "GET /api/v2/classroom-screens/feed";
test("healthy network and socket do not imply content success; retry and cached failures have distinct sync states", async () => {
  const store = h.newStore({screen: true});
  store.screenNetworkOnline = true;
  store.screenRealtimeConnected = true;
  assert.equal(store.screenSyncState, "awaiting");
  const updatedAt = "2026-09-12T04:00:00Z";
  let gate = deferred(), status = 200, started = false;
  h.routes.set(endpoint, async (_req, reply) => {
    started = true;
    await gate.promise;
    reply(status === 200 ? {items: [{id: "work"}], generatedAt: updatedAt} : {message: "temporarily unavailable"}, status);
  });
  let pending = store.loadScreenFeed();
  try {
    await eventually(() => assert(started));
    assert.equal(store.screenSyncState, "refreshing");
    gate.resolve(); await pending;
    assert.equal(store.screenSyncState, "synced");
    status = 503; gate = deferred(); started = false;
    pending = store.loadScreenFeed();
    await eventually(() => assert(started));
    assert.equal(store.screenSyncState, "refreshing");
    gate.resolve(); await pending;
    assert.equal(store.feedUsingCache, true);
    assert.equal(store.feedGeneratedAt, updatedAt);
    assert.equal(store.screenSyncState, "stale");
    store.screenNetworkOnline = false;
    assert.equal(store.screenSyncState, "offline");
    store.screenNetworkOnline = true;
    status = 200;
    await store.loadScreenFeed();
    assert.equal(store.screenSyncState, "synced");
    // A failure on a different day has no successful snapshot to claim as synced.
    store.boardDate = "2026-09-13"; status = 503;
    await store.loadScreenFeed();
    assert.equal(store.feedGeneratedAt, null);
    assert.equal(store.screenSyncState, "stale");
  } finally { gate.resolve(); await pending; }
});

const mutations = {
  binding: store => { store.screenSession = {binding: {id: "screen-b"}, workspaces: [{id: "class-b"}]}; },
  date: store => { store.boardDate = "2026-09-08"; },
  token: () => { h.api.saveClassroomScreenToken("new-session-token"); },
  workspaces: store => { store.screenSession.workspaces = [{id: "class-b"}]; },
  unbind: store => { store.screenSession = null; h.api.clearClassroomScreenToken(); },
};

for (const [name, change] of Object.entries(mutations)) {
  for (const status of [200, 503, 401, 409]) {
    test(`late feed ${status} after ${name} change cannot replace current data, touch cache or revoke the new session`, async () => {
      const store = h.newStore({screen: true});
      store.boardDate = "2026-09-07";
      const gate = deferred();
      let started = false;
      h.routes.set(endpoint, async (req, reply) => {
        assert.equal(req.query.get("boardDate"), "2026-09-07");
        started = true;
        await gate.promise;
        reply(status === 200 ? {items: [{id: "old-work"}], generatedAt: "old", nextTransitionAt: "2026-09-08T00:00:00Z"}
          : {message: "old request error"}, status);
      });
      const pending = store.loadScreenFeed();
      try {
        await eventually(() => assert(started));
        change(store);
        store.feed = [{id: "current-work"}];
        store.feedGeneratedAt = "current";
        store.feedLoadError = "current status";
        store.feedUsingCache = true;
        const token = h.api.getClassroomScreenToken();
        const binding = store.screenSession?.binding?.id;
        const key = `classworks-v2-screen-feed-cache:${binding || "screen-a"}:${store.boardDate}`;
        const cache = JSON.stringify({savedAt: Date.now(), value: {items: [{id: "cached-work"}]}});
        h.storage.setItem(key, cache);
        gate.resolve(); await pending;
        assert.deepEqual(store.feed, [{id: "current-work"}]);
        assert.equal(store.feedGeneratedAt, "current");
        assert.equal(store.feedLoadError, "current status");
        assert.equal(store.feedUsingCache, true);
        assert.equal(h.storage.getItem(key), cache);
        assert.equal(h.api.getClassroomScreenToken(), token);
        assert.equal(store.screenSession?.binding?.id, binding);
        assert.equal(store.feedLoading, false);
        if (key !== "classworks-v2-screen-feed-cache:screen-a:2026-09-07") {
          assert.equal(h.storage.getItem("classworks-v2-screen-feed-cache:screen-a:2026-09-07"), null);
        }
      } finally { gate.resolve(); await pending; }
    });
  }
}

test("an old response cannot stop a newer refresh; unchanged scope still updates its own cache", async () => {
  const store = h.newStore({screen: true});
  const gates = [deferred(), deferred()];
  let calls = 0;
  h.routes.set(endpoint, async (_req, reply) => {
    const call = calls++;
    await gates[call].promise;
    reply({items: [{id: `work-${call}`}], generatedAt: `generation-${call}`});
  });
  const old = store.loadScreenFeed();
  await eventually(() => assert.equal(calls, 1));
  mutations.binding(store);
  const current = store.loadScreenFeed();
  try {
    await eventually(() => assert.equal(calls, 2));
    gates[0].resolve(); await old;
    assert.equal(store.feedLoading, true);
    assert.deepEqual(store.feed, []);
    gates[1].resolve(); await current;
    assert.deepEqual(store.feed, [{id: "work-1"}]);
    assert.equal(store.feedLoading, false);
    const cached = JSON.parse(h.storage.getItem(`classworks-v2-screen-feed-cache:screen-b:${store.boardDate}`));
    assert.deepEqual(cached.value.items, [{id: "work-1"}]);
  } finally { gates.forEach(gate => gate.resolve()); await Promise.all([old, current]); }
});
