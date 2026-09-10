import test from "node:test";
import assert from "node:assert/strict";
import {
  loadTeacherTargetPreferences,
  loadTeacherTargetSyncState,
  mergeTeacherTargetPreferences,
  reconcileTeacherTargetPreferences,
  rememberTeacherTargets,
  saveTeacherTargetPreferences,
  teacherTargetPreferencesKey,
  teacherTargetSyncStateKey,
  teacherTargetCombinationId,
  toggleFavoriteTeacherTargets,
} from "../src/utils/teacherTargetPreferences.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("teacher target combinations are stable regardless of target order", () => {
  assert.equal(
    teacherTargetCombinationId({type: "NOTICE", targetWorkspaceIds: ["b", "a"]}),
    teacherTargetCombinationId({type: "NOTICE", targetWorkspaceIds: ["a", "b"]}),
  );
});

test("recent targets are deduplicated and newest combination wins", () => {
  const storage = memoryStorage();
  const combination = {
    type: "ASSIGNMENT",
    subjectId: "physics",
    targetWorkspaceIds: ["a1"],
  };
  rememberTeacherTargets("teacher-1", combination, storage);
  rememberTeacherTargets("teacher-1", combination, storage);
  assert.equal(loadTeacherTargetPreferences("teacher-1", storage).recent.length, 1);
});

test("favorite targets can be added and removed", () => {
  const storage = memoryStorage();
  const combination = {type: "NOTICE", targetWorkspaceIds: ["class-1", "class-2"]};
  toggleFavoriteTeacherTargets("teacher-1", combination, storage);
  assert.equal(loadTeacherTargetPreferences("teacher-1", storage).favorites.length, 1);
  toggleFavoriteTeacherTargets("teacher-1", combination, storage);
  assert.equal(loadTeacherTargetPreferences("teacher-1", storage).favorites.length, 0);
});

test("local changes are marked dirty until an account sync succeeds", () => {
  const storage = memoryStorage();
  rememberTeacherTargets("teacher-1", {
    type: "NOTICE",
    targetWorkspaceIds: ["class-1"],
  }, storage);
  assert.equal(loadTeacherTargetSyncState("teacher-1", storage).dirty, true);
});

test("local and remote teacher targets merge by newest unique combination", () => {
  const merged = mergeTeacherTargetPreferences(
    {favorites: [{type: "NOTICE", targetWorkspaceIds: ["a"], savedAt: "2026-08-10T00:00:00Z"}]},
    {favorites: [
      {type: "NOTICE", targetWorkspaceIds: ["a"], savedAt: "2026-08-11T00:00:00Z"},
      {type: "NOTICE", targetWorkspaceIds: ["b"], savedAt: "2026-08-09T00:00:00Z"},
    ]},
  );
  assert.equal(merged.favorites.length, 2);
  assert.equal(merged.favorites[0].savedAt, "2026-08-11T00:00:00.000Z");
});

test("removal journal is persisted with favorites, survives recent edits, and is account isolated", () => {
  const storage = memoryStorage();
  const item = {type: "NOTICE", targetWorkspaceIds: ["a"]};
  saveTeacherTargetPreferences("a", {favorites: [item]}, storage, {dirty: false});
  toggleFavoriteTeacherTargets("a", item, storage);
  rememberTeacherTargets("a", item, storage);
  const record = JSON.parse(storage.getItem(teacherTargetPreferencesKey("a")));
  assert.equal(record.favorites.length, 0);
  assert.deepEqual(record.syncState.removedFavoriteIds, [teacherTargetCombinationId(item)]);
  assert.deepEqual(loadTeacherTargetSyncState("b", storage).removedFavoriteIds, []);
  toggleFavoriteTeacherTargets("a", item, storage);
  assert.deepEqual(loadTeacherTargetSyncState("a", storage).removedFavoriteIds, []);
});

test("legacy sync metadata migrates and a failed atomic write retains the prior favorite and journal", () => {
  const storage = memoryStorage();
  const item = {type: "NOTICE", targetWorkspaceIds: ["a"]};
  storage.setItem(teacherTargetPreferencesKey("a"), JSON.stringify({favorites: [item]}));
  storage.setItem(teacherTargetSyncStateKey("a"), JSON.stringify({dirty: false, lastSyncedAt: "2026-09-01T00:00:00Z"}));
  assert.equal(loadTeacherTargetSyncState("a", storage).lastSyncedAt, "2026-09-01T00:00:00Z");
  assert.throws(() => toggleFavoriteTeacherTargets("a", item, {
    getItem: storage.getItem, setItem: () => { throw new Error("quota"); },
  }), /quota/);
  assert.equal(loadTeacherTargetPreferences("a", storage).favorites.length, 1);
  assert.equal(loadTeacherTargetSyncState("a", storage).dirty, false);
  toggleFavoriteTeacherTargets("a", item, storage);
  assert.equal(loadTeacherTargetSyncState("a", storage).dirty, true);
  assert.equal(loadTeacherTargetSyncState("a", storage).removedFavoriteIds.length, 1);
});

test("removed favorites are filtered before the merge limit so remote additions remain", () => {
  const favorites = Array.from({length: 8}, (_, i) => ({type: "NOTICE", targetWorkspaceIds: [`a${i}`], savedAt: "2026-09-10T00:00:00Z"}));
  const extra = {type: "NOTICE", targetWorkspaceIds: ["remote"], savedAt: "2026-09-09T00:00:00Z"};
  const next = reconcileTeacherTargetPreferences({favorites, recent: []}, {favorites: [extra], recent: []}, {
    removedFavoriteIds: [teacherTargetCombinationId(favorites[0])],
  });
  assert.equal(next.favorites.length, 8);
  assert.ok(next.favorites.some(item => item.targetWorkspaceIds[0] === "remote"));
});

test("legacy synced favorites are not treated as additions by a new recent edit", () => {
  const storage = memoryStorage();
  const item = {type: "NOTICE", targetWorkspaceIds: ["old"]};
  storage.setItem(teacherTargetPreferencesKey("a"), JSON.stringify({favorites: [item], syncState: {
    dirty: false, lastSyncedAt: "2026-09-01T00:00:00Z", revision: 1, removedFavoriteIds: [],
  }}));
  const local = rememberTeacherTargets("a", {type: "NOTICE", targetWorkspaceIds: ["new"]}, storage);
  const state = loadTeacherTargetSyncState("a", storage);
  assert.deepEqual(state.addedFavoriteIds, []);
  const next = reconcileTeacherTargetPreferences(local, {favorites: [], recent: []}, state);
  assert.deepEqual(next.favorites, []);
  assert.equal(next.recent.length, 1);
});

test("legacy unsynced additions survive journal migration and deletion followed by re-add remains intentional", () => {
  const storage = memoryStorage();
  const item = {type: "NOTICE", targetWorkspaceIds: ["old-pending"]};
  storage.setItem(teacherTargetPreferencesKey("a"), JSON.stringify({favorites: [item], syncState: {
    dirty: true, lastSyncedAt: "2026-09-01T00:00:00Z", revision: 1, removedFavoriteIds: [],
  }}));
  const local = rememberTeacherTargets("a", item, storage);
  const id = teacherTargetCombinationId(item);
  assert.deepEqual(loadTeacherTargetSyncState("a", storage).addedFavoriteIds, [id]);
  assert.equal(reconcileTeacherTargetPreferences(local, {favorites: [], recent: []}, loadTeacherTargetSyncState("a", storage)).favorites.length, 1);
  toggleFavoriteTeacherTargets("a", item, storage);
  assert.deepEqual(loadTeacherTargetSyncState("a", storage).addedFavoriteIds, []);
  toggleFavoriteTeacherTargets("a", item, storage);
  assert.deepEqual(loadTeacherTargetSyncState("a", storage).addedFavoriteIds, [id]);
  assert.deepEqual(loadTeacherTargetSyncState("a", storage).removedFavoriteIds, []);
});
