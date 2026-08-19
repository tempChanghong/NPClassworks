import test from "node:test";
import assert from "node:assert/strict";
import {
  isStudentHomeworkCompleted,
  isStudentHomeworkUpdatedAfterCompletion,
  loadStudentHomeworkCompletions,
  setStudentHomeworkCompleted,
  studentHomeworkCompletionStats,
} from "../src/utils/studentHomeworkCompletion.js";

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

const assignment = {id: "homework-1", type: "ASSIGNMENT", revision: 2};

test("completion is local and tied to the current publication revision", () => {
  const storage = fakeStorage();
  const records = setStudentHomeworkCompleted(assignment, true, storage, Date.now());
  assert.equal(isStudentHomeworkCompleted(assignment, records), true);
  assert.equal(isStudentHomeworkCompleted({...assignment, revision: 3}, records), false);
  assert.equal(isStudentHomeworkUpdatedAfterCompletion({...assignment, revision: 3}, records), true);
  assert.deepEqual(loadStudentHomeworkCompletions(storage), records);
});

test("completion can be cleared without affecting other assignments", () => {
  const storage = fakeStorage();
  setStudentHomeworkCompleted(assignment, true, storage, Date.now());
  const records = setStudentHomeworkCompleted(assignment, false, storage);
  assert.equal(isStudentHomeworkCompleted(assignment, records), false);
});

test("completion statistics ignore notices", () => {
  const records = {"homework-1": {revision: 2, completedAt: Date.now()}};
  assert.deepEqual(studentHomeworkCompletionStats([
    assignment,
    {id: "homework-2", type: "ASSIGNMENT", revision: 1},
    {id: "notice-1", type: "NOTICE", revision: 1},
  ], records), {total: 2, completed: 1, updated: 0});
});

test("invalid stored data is ignored", () => {
  const storage = fakeStorage({"classworks-v2-student-homework-completions": "not-json"});
  assert.deepEqual(loadStudentHomeworkCompletions(storage), {});
});
