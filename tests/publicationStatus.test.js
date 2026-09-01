import assert from "node:assert/strict";
import test from "node:test";
import {buildConflictComparison, PUBLICATION_CONFLICT_FIELDS} from "../src/utils/conflictComparison.js";
import {buildPublicationReceipt} from "../src/utils/publicationReceipt.js";
import {publicationDisplayState, publicationIndicatorVisibility} from "../src/utils/publicationStatus.js";

test("publication status uses the same language for drafts, schedules and certification", () => {
  assert.equal(publicationDisplayState({status: "DRAFT"}).key, "draft");
  assert.equal(publicationDisplayState({status: "PUBLISHED", isCertified: false}).key, "pending");
  assert.equal(publicationDisplayState({
    status: "PUBLISHED",
    isCertified: true,
    publishAt: "2026-08-28T12:00:00.000Z",
  }, {now: new Date("2026-08-28T10:00:00.000Z")}).key, "scheduled");
});

test("large screens hide ordinary confirmed indicators but retain actionable states", () => {
  assert.deepEqual(publicationIndicatorVisibility({
    status: "PUBLISHED",
    isCertified: true,
    priority: "NORMAL",
  }, {screenMode: true}), {
    state: publicationDisplayState({status: "PUBLISHED", isCertified: true, priority: "NORMAL"}),
    showState: false,
    showPriority: false,
  });
  assert.equal(publicationIndicatorVisibility({
    status: "PUBLISHED",
    isCertified: false,
    priority: "NORMAL",
  }, {screenMode: true}).showState, true);
  assert.equal(publicationIndicatorVisibility({
    status: "PUBLISHED",
    isCertified: true,
    priority: "URGENT",
  }, {screenMode: true}).showPriority, true);
});

test("publication conflict comparison keeps only fields changed between local and server", () => {
  const rows = buildConflictComparison(
    {title: "我的标题", content: "相同", targetWorkspaceIds: ["b", "a"]},
    {title: "服务器标题", content: "相同", targets: [{workspaceId: "a"}, {workspaceId: "b"}]},
    PUBLICATION_CONFLICT_FIELDS,
  );
  assert.deepEqual(rows.map((item) => item.key), ["title"]);
});

test("multi-target publication receipt reports every transaction target", () => {
  const receipt = buildPublicationReceipt({
    id: "publication-1",
    type: "ASSIGNMENT",
    status: "PUBLISHED",
    isCertified: true,
    publishAt: "2026-08-28T08:00:00.000Z",
    targets: [
      {workspaceId: "a", workspace: {name: "高二1班", type: "ADMIN_CLASS"}},
      {workspaceId: "b", workspace: {name: "物理A1", type: "COURSE_GROUP"}},
    ],
  }, {now: new Date("2026-08-28T09:00:00.000Z")});
  assert.equal(receipt.targetCount, 2);
  assert.equal(receipt.targets.every((item) => item.state === "accepted"), true);
  assert.equal(receipt.isAtomic, true);
});
