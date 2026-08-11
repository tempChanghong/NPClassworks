import test from "node:test";
import assert from "node:assert/strict";
import {
  assignmentDueState,
  organizePublicationFeed,
  publicationFilterOptions,
} from "../src/utils/publicationFeed.js";

const workspace = (id, name, type = "COURSE_GROUP") => ({workspaceId: id, workspace: {id, name, type}});
const assignment = (id, subjectId, subjectName, priority, dueAt, target) => ({
  id,
  type: "ASSIGNMENT",
  subjectId,
  subject: {id: subjectId, name: subjectName},
  priority,
  dueAt,
  publishAt: "2026-08-10T08:00:00.000Z",
  targets: [target],
});

test("feed options deduplicate subjects and put administrative classes first", () => {
  const items = [
    assignment("1", "physics", "物理", "NORMAL", null, workspace("phy-a1", "物理A1")),
    assignment("2", "physics", "物理", "NORMAL", null, workspace("g2-c3", "高二3班", "ADMIN_CLASS")),
  ];
  const options = publicationFilterOptions(items);
  assert.deepEqual(options.subjects.map((item) => item.title), ["物理"]);
  assert.deepEqual(options.workspaces.map((item) => item.title), ["高二3班", "物理A1"]);
});

test("assignments are grouped by subject and smart sorted by priority then due time", () => {
  const target = workspace("g2-c3", "高二3班", "ADMIN_CLASS");
  const items = [
    assignment("normal", "physics", "物理", "NORMAL", "2026-08-11T12:00:00.000Z", target),
    assignment("urgent", "physics", "物理", "URGENT", "2026-08-12T12:00:00.000Z", target),
    assignment("chemistry", "chemistry", "化学", "IMPORTANT", null, target),
  ];
  const organized = organizePublicationFeed(items);
  assert.equal(organized.assignmentGroups.length, 2);
  assert.equal(organized.assignmentGroups[0].name, "物理");
  assert.deepEqual(organized.assignmentGroups[0].publications.map((item) => item.id), ["urgent", "normal"]);
});

test("subject filters keep cross-cutting notices while workspace filters remain strict", () => {
  const classTarget = workspace("g2-c3", "高二3班", "ADMIN_CLASS");
  const otherTarget = workspace("g2-c4", "高二4班", "ADMIN_CLASS");
  const items = [
    assignment("physics", "physics", "物理", "NORMAL", null, classTarget),
    assignment("chemistry", "chemistry", "化学", "NORMAL", null, classTarget),
    {id: "notice", type: "NOTICE", priority: "IMPORTANT", publishAt: "2026-08-10T09:00:00.000Z", targets: [classTarget]},
    {id: "other", type: "NOTICE", priority: "NORMAL", publishAt: "2026-08-10T09:00:00.000Z", targets: [otherTarget]},
  ];
  const organized = organizePublicationFeed(items, {subjectId: "physics", workspaceId: "g2-c3"});
  assert.deepEqual(organized.notices.map((item) => item.id), ["notice"]);
  assert.deepEqual(organized.assignmentGroups[0].publications.map((item) => item.id), ["physics"]);
});

test("urgent notices can be removed from the card list when the screen banner owns them", () => {
  const target = workspace("g2-c3", "高二3班", "ADMIN_CLASS");
  const items = [
    {id: "urgent", type: "NOTICE", priority: "URGENT", targets: [target]},
    {id: "normal", type: "NOTICE", priority: "NORMAL", targets: [target]},
  ];
  assert.deepEqual(
    organizePublicationFeed(items, {excludeUrgentNotices: true}).notices.map((item) => item.id),
    ["normal"],
  );
});

test("deadline states distinguish overdue, today, soon and future", () => {
  const now = new Date(2026, 7, 10, 8);
  assert.equal(assignmentDueState(new Date(2026, 7, 10, 7, 59).toISOString(), now).key, "overdue");
  assert.equal(assignmentDueState(new Date(2026, 7, 10, 16).toISOString(), now).key, "today");
  assert.equal(assignmentDueState(new Date(2026, 7, 11, 7).toISOString(), now).key, "soon");
  assert.equal(assignmentDueState(new Date(2026, 7, 12, 8).toISOString(), now).key, "future");
});
