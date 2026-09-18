import test from "node:test";
import assert from "node:assert/strict";
import {todayActionCenter} from "../src/utils/teacherActionCenter.js";

test("today action center filters board date and certification and recomputes all counts", () => {
  const item = (id, boardDate, reason, extra = {}) => ({id, reason, ...extra, publication: {boardDate, isCertified: false}});
  const source = {summary: {total: 99}, items: [
    item("past", "2026-09-17", "CREATED_BY_SCREEN"),
    item("future", "2026-09-19", "OTHER_UNCERTIFIED"),
    item("a", "2026-09-18T00:00:00.000Z", "CREATED_BY_SCREEN", {overdue: true}),
    item("b", "2026-09-18", "CHANGED_AFTER_CERTIFICATION", {dueSoon: true}),
    item("c", "2026-09-18", "OTHER_UNCERTIFIED"),
    {id: "certified", publication: {boardDate: "2026-09-18", isCertified: true}},
  ]};
  const before = JSON.stringify(source);
  const current = todayActionCenter(source, "2026-09-18");
  assert.deepEqual(current.items.map(item => item.id), ["a", "b", "c"]);
  assert.deepEqual(current.summary, {total: 3, createdByScreen: 1, changedAfterCertified: 1, other: 1, dueSoon: 1, overdue: 1});
  assert.deepEqual(todayActionCenter(source, "2026-09-19").items.map(item => item.id), ["future"]);
  assert.equal(JSON.stringify(source), before);
  assert.equal(todayActionCenter(null, "2026-09-18").summary.total, 0);
});
