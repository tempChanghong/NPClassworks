import {test} from "node:test";
import assert from "node:assert/strict";
import {publicationDraftInput} from "../src/utils/publicationDraft.js";
import {submissionOf, withSubmission} from "../src/utils/homeworkInstructions.js";
import {fillHomeworkTemplate} from "../src/utils/homeworkTemplates.js";
import {homeworkPrintDocument, homeworkPrintSnapshot} from "../src/utils/homeworkPrint.js";
import {planHomeworkImages} from "../src/utils/homeworkImages.js";
import {homeworkChangeSnapshot, createHomeworkChangeTracker} from "../src/utils/homeworkChanges.js";

const form = () => ({type: "ASSIGNMENT", subjectId: "math", targetWorkspaceIds: ["a", "b"], title: "练习", content: "完成五题",
  boardDate: "2026-09-12", publishAt: "2026-09-12T06:00:00+08:00", dueAt: "2026-09-13T08:00:00+08:00", priority: "NORMAL",
  materials: "圆规", materialsDate: "2026-09-13", submission: "交给〔课代表〕", correctionReason: "课堂进度调整"});

test("preview serialization validates dates, preserves metadata and never mutates or publishes the form", () => {
  const source = form(), metadata = {custom: true, correctionReason: "上次原因"};
  const input = publicationDraftInput(source, metadata, "PUBLISHED", true);
  assert.deepEqual(source, form()); assert.equal(metadata.correctionReason, "上次原因");
  assert.equal(input.contentJson.correctionReason, undefined);
  assert.equal(input.correctionReason, "课堂进度调整");
  assert.equal(input.contentJson.submission, source.submission);
  assert.deepEqual(input.contentJson.preparation, {text: "圆规", date: "2026-09-13"});
  assert.equal(input.contentJson.custom, true);
  assert.throws(() => publicationDraftInput({...source, boardDate: "2026-02-30"}, null, "PUBLISHED"), /作业板日期/);
  assert.throws(() => publicationDraftInput({...source, dueAt: "2026-09-11T06:00:00+08:00"}, null, "PUBLISHED"), /早于/);
  assert.throws(() => publicationDraftInput({...source, submission: "字".repeat(501)}, null, "PUBLISHED"), /500/);
  const noHomework = publicationDraftInput({...source, noHomework: true}, null, "PUBLISHED");
  assert.equal(noHomework.contentJson.kind, "NO_HOMEWORK");
  assert.equal(noHomework.contentJson.submission, undefined); assert.equal(noHomework.dueAt, null);
  assert.equal(noHomework.correctionReason, undefined);
});

test("submission templates substitute literal text and exports keep escaped complete instructions", () => {
  const filled = fillHomeworkTemplate({title: "练习", content: "完成五题", submission: "交给〔课代表〕"}, new Map([["课代表", "<script>&数学课代表"]]));
  assert.equal(filled.submission, "交给<script>&数学课代表");
  const item = {...publicationDraftInput({...form(), submission: filled.submission}, null, "PUBLISHED"), id: "one", revision: 1,
    subject: {name: "数学"}, targets: [{workspaceId: "a", workspace: {name: "一班"}}]};
  const snapshot = homeworkPrintSnapshot({publications: [item], workspaceIds: ["a"], boardDate: "2026-09-12", now: new Date("2026-09-12T08:00:00+08:00")});
  const html = homeworkPrintDocument(snapshot);
  assert.ok(html.includes("交给&lt;script&gt;&amp;数学课代表")); assert.ok(!html.includes("<script>"));
  const text = planHomeworkImages(snapshot, () => 15).flatMap(page => page.rows.map(row => row.text)).join("");
  assert.ok(text.includes(filled.submission));
  assert.equal(submissionOf({...item, type: "NOTICE"}), "");
  assert.deepEqual(withSubmission({submission: "旧", preparation: {text: "圆规"}}, ""), {preparation: {text: "圆规"}});
});

test("submission corrections highlight the changed instructions with the current reason only", () => {
  const item = {...publicationDraftInput(form(), null, "PUBLISHED"), id: "one", revision: 1, targets: [{workspaceId: "a"}]};
  const track = createHomeworkChangeTracker();
  const snap = row => homeworkChangeSnapshot([row], "2026-09-12", ["a"]);
  track.update(snap(item));
  const next = {...item, revision: 2, contentJson: {...item.contentJson, submission: "直接交老师", correctionReason: "课代表请假"}};
  const [change] = track.update(snap(next));
  assert.deepEqual(change.changes.map(field => field.key), ["submission"]);
  assert.equal(change.after.correctionReason, "课代表请假");
  const [latest] = track.update(snap({...next, revision: 3, contentJson: {...next.contentJson, correctionReason: undefined}}));
  assert.equal(latest.after.correctionReason, "");
});
