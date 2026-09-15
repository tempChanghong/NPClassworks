import {test} from "node:test";
import assert from "node:assert/strict";
import {canReuseHomework, homeworkReuseDraft} from "../src/utils/homeworkReuse.js";
import {publicationDraftInput} from "../src/utils/publicationDraft.js";
import {NO_HOMEWORK_CONTENT, NO_HOMEWORK_META, NO_HOMEWORK_TITLE, isNoHomework} from "../src/utils/noHomework.js";

const source = {
  id: "original", type: "ASSIGNMENT", status: "PUBLISHED", subjectId: "math", revision: 5,
  title: "练习", content: "必做题", publishAt: "2020-01-01T00:00:00Z", dueAt: "2020-01-02T00:00:00Z",
  boardDate: "2020-01-01", priority: "IMPORTANT", isCertified: false, authorAccountId: "other",
  targets: [{workspaceId: "old-class"}],
  contentJson: {optionalContent: "选做题", submission: "交课代表", preparation: {text: "圆规", date: "2020-01-02"}, correctionReason: "旧更正", unrecognized: true},
};

test("history reuse produces independent content requiring new targets and preparation date", () => {
  const before = JSON.parse(JSON.stringify(source));
  const form = homeworkReuseDraft(source, "2030-01-01");
  assert.equal(form.dueAt, ""); assert.equal(form.materialsDate, "");
  form.publishAt = "2030-01-01T00:00:00Z";
  assert.throws(() => publicationDraftInput(form, null, "PUBLISHED"), /发布目标/);
  form.targetWorkspaceIds.push("new-class");
  assert.throws(() => publicationDraftInput(form, null, "PUBLISHED"), /携带日期/);
  form.materialsDate = "2030-01-02";
  const input = publicationDraftInput(form, null, "PUBLISHED");
  assert.deepEqual(input.contentJson, {optionalContent: "选做题", submission: "交课代表", preparation: {text: "圆规", date: "2030-01-02"}});
  assert.equal(input.dueAt, null); assert.equal(input.boardDate, "2030-01-01");
  for (const key of ["id", "revision", "authorAccountId", "isCertified", "correctionReason"]) assert.equal(key in input, false);
  assert.deepEqual(source, before);
});

test("history reuse excludes notices, drafts, future publications and invalid dates", () => {
  for (const override of [{type: "NOTICE"}, {status: "DRAFT"}, {publishAt: "2999-01-01T00:00:00Z"}, {publishAt: "invalid"}, {subjectId: null}]) {
    assert.equal(canReuseHomework({...source, ...override}), false);
    assert.throws(() => homeworkReuseDraft({...source, ...override}, "2030-01-01"), /不可复用/);
  }
  assert.equal(canReuseHomework({...source, status: "WITHDRAWN"}), true);
  assert.throws(() => homeworkReuseDraft(source, "2030-02-30"), /有效/);
});

test("no-homework reuse retains its meaning without copying certification or old metadata", () => {
  const form = homeworkReuseDraft({...source, title: NO_HOMEWORK_TITLE, content: NO_HOMEWORK_CONTENT, dueAt: null, contentJson: NO_HOMEWORK_META}, "2030-01-01");
  const input = publicationDraftInput({...form, targetWorkspaceIds: ["new-class"], publishAt: "2030-01-01T00:00:00Z"}, null, "PUBLISHED");
  assert.equal(isNoHomework(input), true);
  assert.deepEqual(input.contentJson, NO_HOMEWORK_META);
});
