import test from "node:test";
import assert from "node:assert/strict";
import {
  screenNotificationCenterItems,
  screenNotificationCenterSummary,
} from "../src/utils/screenNotificationCenter.js";

test("screen notification center keeps acknowledged urgent notices visible", () => {
  const publications = [
    {id: "urgent", revision: 2, type: "NOTICE", priority: "URGENT", publishAt: "2026-08-28T08:00:00Z"},
    {id: "homework", revision: 1, type: "ASSIGNMENT", priority: "NORMAL"},
  ];
  const items = screenNotificationCenterItems(publications, new Set(["urgent:2"]));
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "urgent");
  assert.equal(items[0].acknowledged, true);
});

test("pending and urgent notices sort ahead of acknowledged notices", () => {
  const publications = [
    {id: "old-urgent", revision: 1, type: "NOTICE", priority: "URGENT", publishAt: "2026-08-28T07:00:00Z"},
    {id: "important", revision: 1, type: "NOTICE", priority: "IMPORTANT", publishAt: "2026-08-28T09:00:00Z"},
    {id: "normal", revision: 1, type: "NOTICE", priority: "NORMAL", publishAt: "2026-08-28T10:00:00Z"},
  ];
  const items = screenNotificationCenterItems(publications, new Set(["old-urgent:1"]));
  assert.deepEqual(items.map((item) => item.id), ["important", "normal", "old-urgent"]);
  assert.deepEqual(screenNotificationCenterSummary(items), {total: 3, pending: 2, urgent: 1});
});
