import test from "node:test";
import assert from "node:assert/strict";
import {
  loadTeacherTargetPreferences,
  loadTeacherTargetSyncState,
  mergeTeacherTargetPreferences,
  rememberTeacherTargets,
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
