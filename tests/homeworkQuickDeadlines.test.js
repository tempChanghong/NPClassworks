import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOMEWORK_QUICK_DEADLINES,
  resolveHomeworkQuickDeadline,
  sanitizeHomeworkQuickDeadlines,
} from "../src/utils/homeworkQuickDeadlines.js";

test("homework quick deadlines retain valid school configuration", () => {
  const custom = [{label: "后早", dayOffset: 2, time: "07:10"}];
  assert.deepEqual(sanitizeHomeworkQuickDeadlines(custom), custom);
  assert.deepEqual(sanitizeHomeworkQuickDeadlines([]), DEFAULT_HOMEWORK_QUICK_DEADLINES);
});

test("homework quick deadlines resolve across month boundaries", () => {
  const result = resolveHomeworkQuickDeadline(
    {label: "后早", dayOffset: 2, time: "07:30"},
    new Date(2026, 7, 31, 20, 0),
  );
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 8);
  assert.equal(result.getDate(), 2);
  assert.equal(result.getHours(), 7);
  assert.equal(result.getMinutes(), 30);
});
