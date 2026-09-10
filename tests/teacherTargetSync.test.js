import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";
import {loadTeacherTargetSyncState, saveTeacherTargetPreferences, toggleFavoriteTeacherTargets} from "../src/utils/teacherTargetPreferences.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());
const combination = id => ({type: "NOTICE", targetWorkspaceIds: [id], savedAt: "2026-09-10T00:00:00Z"});
const ids = preferences => preferences.favorites.map(item => item.targetWorkspaceIds[0]).sort();
function setup() {
  const store = h.newStore();
  store.account = {id: "teacher-a"};
  h.api.saveAccountTokens({accessToken: "teacher-a"});
  let remote = {favorites: [combination("a")], recent: []};
  h.routes.set("GET /accounts/preferences/teacher-targets", (_req, reply) => reply({preferences: remote}));
  h.routes.set("PUT /accounts/preferences/teacher-targets", (req, reply) => {
    remote = req.body.preferences; reply({preferences: remote});
  });
  store.teacherTargetPreferences = saveTeacherTargetPreferences("teacher-a", remote, localStorage, {dirty: false});
  return {store, get remote() { return remote; }, set remote(value) { remote = value; }};
}

test("offline removal survives reload and merges another device's new favorite", async () => {
  const s = setup();
  const get = h.routes.get("GET /accounts/preferences/teacher-targets");
  const put = h.routes.get("PUT /accounts/preferences/teacher-targets");
  for (const method of ["GET", "PUT"]) h.routes.set(`${method} /accounts/preferences/teacher-targets`, (_req, reply) => reply({message: "offline"}, 503));
  s.store.toggleTeacherTargetFavorite(combination("a"));
  await eventually(() => assert.equal(s.store.teacherTargetPreferencesSyncing, false));
  assert.deepEqual(ids(s.store.teacherTargetPreferences), []);
  assert.equal(loadTeacherTargetSyncState("teacher-a").dirty, true);
  s.remote.favorites.push(combination("b"));
  h.routes.set("GET /accounts/preferences/teacher-targets", get);
  h.routes.set("PUT /accounts/preferences/teacher-targets", put);
  const reloaded = h.newStore(); reloaded.account = {id: "teacher-a"};
  await reloaded.hydrateTeacherTargetPreferences();
  assert.deepEqual(ids(reloaded.teacherTargetPreferences), ["b"]);
  assert.deepEqual(ids(s.remote), ["b"]);
  assert.equal(loadTeacherTargetSyncState("teacher-a").dirty, false);
});

test("offline additions still survive reloading and merge with new remote favorites", async () => {
  const s = setup();
  const get = h.routes.get("GET /accounts/preferences/teacher-targets");
  h.routes.set("GET /accounts/preferences/teacher-targets", (_req, reply) => reply({message: "offline"}, 503));
  s.store.toggleTeacherTargetFavorite(combination("local-new"));
  await eventually(() => assert.equal(s.store.teacherTargetPreferencesSyncing, false));
  s.remote.favorites.push(combination("remote-new"));
  h.routes.set("GET /accounts/preferences/teacher-targets", get);
  const reloaded = h.newStore(); reloaded.account = {id: "teacher-a"};
  await reloaded.hydrateTeacherTargetPreferences();
  assert.deepEqual(ids(reloaded.teacherTargetPreferences), ["a", "local-new", "remote-new"]);
  assert.deepEqual(ids(s.remote), ["a", "local-new", "remote-new"]);
  assert.equal(loadTeacherTargetSyncState("teacher-a").dirty, false);
});

for (const method of ["GET", "PUT"]) {
  test(`an edit during hydration's ${method} is preserved and acknowledged only by its own save`, async () => {
    const s = setup();
    // Pending addition forces hydration to write as well as read.
    s.store.teacherTargetPreferences = toggleFavoriteTeacherTargets("teacher-a", combination("b"));
    const path = `${method} /accounts/preferences/teacher-targets`;
    const healthy = h.routes.get(path);
    const started = deferred(), release = deferred();
    let calls = 0;
    h.routes.set(path, async (req, reply) => {
      if (++calls === 1) { started.resolve(); await release.promise; }
      healthy(req, reply);
    });
    const pending = s.store.hydrateTeacherTargetPreferences();
    await started.promise;
    try {
      s.store.toggleTeacherTargetFavorite(combination("a"));
      assert.deepEqual(ids(s.store.teacherTargetPreferences), ["b"]);
      assert.equal(loadTeacherTargetSyncState("teacher-a").dirty, true);
    } finally { release.resolve(); }
    await pending;
    assert.deepEqual(ids(s.remote), ["b"]);
    assert.deepEqual(ids(s.store.teacherTargetPreferences), ["b"]);
    assert.equal(loadTeacherTargetSyncState("teacher-a").dirty, false);
    assert.deepEqual(loadTeacherTargetSyncState("teacher-a").removedFavoriteIds, []);
  });
}

test("a lost save response keeps the removal journal and reloading safely retries it", async () => {
  const s = setup();
  const put = h.routes.get("PUT /accounts/preferences/teacher-targets");
  h.routes.set("PUT /accounts/preferences/teacher-targets", (req, reply) => {
    s.remote = req.body.preferences;
    reply({message: "response lost"}, 503);
  });
  s.store.toggleTeacherTargetFavorite(combination("a"));
  await eventually(() => assert.equal(s.store.teacherTargetPreferencesSyncing, false));
  assert.deepEqual(ids(s.remote), []);
  assert.equal(loadTeacherTargetSyncState("teacher-a").removedFavoriteIds.length, 1);
  h.routes.set("PUT /accounts/preferences/teacher-targets", put);
  const reloaded = h.newStore(); reloaded.account = {id: "teacher-a"};
  await reloaded.hydrateTeacherTargetPreferences();
  assert.deepEqual(ids(reloaded.teacherTargetPreferences), []);
  assert.equal(loadTeacherTargetSyncState("teacher-a").dirty, false);
});

test("re-favoriting during an older removal request keeps the final intent", async () => {
  const s = setup();
  const started = deferred(), release = deferred();
  const put = h.routes.get("PUT /accounts/preferences/teacher-targets");
  let calls = 0;
  h.routes.set("PUT /accounts/preferences/teacher-targets", async (req, reply) => {
    if (++calls === 1) { started.resolve(); await release.promise; }
    put(req, reply);
  });
  s.store.toggleTeacherTargetFavorite(combination("a"));
  await started.promise;
  try { s.store.toggleTeacherTargetFavorite(combination("a")); } finally { release.resolve(); }
  await eventually(() => assert.equal(s.store.teacherTargetPreferencesSyncing, false));
  assert.deepEqual(ids(s.remote), ["a"]);
  assert.deepEqual(ids(s.store.teacherTargetPreferences), ["a"]);
  assert.equal(loadTeacherTargetSyncState("teacher-a").dirty, false);
});

test("a clean local list cannot repopulate an intentionally emptied remote list", async () => {
  const s = setup();
  s.remote = {favorites: [], recent: []};
  await s.store.hydrateTeacherTargetPreferences();
  assert.deepEqual(ids(s.store.teacherTargetPreferences), []);
  assert.deepEqual(ids(s.remote), []);
});
