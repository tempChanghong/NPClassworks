import test from "node:test";
import assert from "node:assert/strict";
import {
  loadTeacherTargetPreferences,
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
