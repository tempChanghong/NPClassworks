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

test("next weekday deadlines always choose the following matching weekday", () => {
  const preset = {label: "下周一 7:30", dateRule: "next-weekday", weekday: 1, time: "07:30"};
  const fromFriday = resolveHomeworkQuickDeadline(preset, new Date(2026, 7, 28, 20, 0));
  assert.equal(fromFriday.getFullYear(), 2026);
  assert.equal(fromFriday.getMonth(), 7);
  assert.equal(fromFriday.getDate(), 31);
  assert.equal(fromFriday.getDay(), 1);
  assert.equal(fromFriday.getHours(), 7);
  assert.equal(resolveHomeworkQuickDeadline(preset, new Date(2026, 7, 31, 8, 0)).getDate(), 7);
});
