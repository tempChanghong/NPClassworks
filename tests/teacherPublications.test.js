import test from "node:test";
import assert from "node:assert/strict";
import {
  filterTeacherPublications,
  teacherPublicationFilterOptions,
  teacherPublicationState,
  teacherPublicationStats,
} from "../src/utils/teacherPublications.js";

const target = (id, name, type = "ADMIN_CLASS") => ({workspaceId: id, workspace: {id, name, type}});
const publication = (overrides = {}) => ({
  id: "publication",
  type: "ASSIGNMENT",
  status: "PUBLISHED",
  isCertified: true,
  subjectId: "physics",
  subject: {id: "physics", name: "物理"},
  title: "练习册",
  content: "完成第十页",
  boardDate: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T08:00:00.000Z",
  targets: [target("g2-c1", "高二1班")],
  ...overrides,
});

test("teacher publication states distinguish action-required records", () => {
  assert.equal(teacherPublicationState(publication({isCertified: false})).key, "pending");
  assert.equal(teacherPublicationState(publication({status: "DRAFT"})).key, "draft");
  assert.equal(teacherPublicationState(publication()).key, "published");
  assert.equal(teacherPublicationState(publication({status: "WITHDRAWN"})).key, "withdrawn");
});

test("teacher publication stats count each lifecycle state", () => {
  const stats = teacherPublicationStats([
    publication({id: "pending", isCertified: false}),
    publication({id: "draft", status: "DRAFT"}),
    publication({id: "published"}),
    publication({id: "withdrawn", status: "WITHDRAWN"}),
  ]);
  assert.deepEqual(stats, {all: 4, pending: 1, draft: 1, published: 1, withdrawn: 1});
});

test("teacher filters combine state, workspace, date and search text", () => {
  const items = [
    publication({id: "match", isCertified: false}),
    publication({id: "other-state", status: "DRAFT"}),
    publication({
      id: "other-class",
      isCertified: false,
      targets: [target("g2-c2", "高二2班")],
    }),
  ];
  const result = filterTeacherPublications(items, {
    state: "pending",
    workspaceId: "g2-c1",
    boardDate: "2026-08-10",
    query: "物理 高二1班",
  });
  assert.deepEqual(result.map((item) => item.id), ["match"]);
});

test("action-required publications sort ahead of drafts and published records", () => {
  const result = filterTeacherPublications([
    publication({id: "published", updatedAt: "2026-08-12T08:00:00.000Z"}),
    publication({id: "draft", status: "DRAFT"}),
    publication({id: "pending", isCertified: false, updatedAt: "2026-08-09T08:00:00.000Z"}),
  ]);
  assert.deepEqual(result.map((item) => item.id), ["pending", "draft", "published"]);
});

test("teacher filter options deduplicate subjects and prioritize administrative classes", () => {
  const options = teacherPublicationFilterOptions([
    publication(),
    publication({
      id: "course",
      targets: [target("phy-a1", "物理A1", "COURSE_GROUP")],
    }),
  ]);
  assert.deepEqual(options.subjects.map((item) => item.title), ["物理"]);
  assert.deepEqual(options.workspaces.map((item) => item.title), ["高二1班", "物理A1"]);
});
