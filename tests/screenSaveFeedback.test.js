import test from "node:test";
import assert from "node:assert/strict";
import {screenHomeworkSaveMessage} from "../src/utils/screenSaveFeedback.js";

test("screen save feedback names the subject, target and pending certification state", () => {
  assert.equal(screenHomeworkSaveMessage(
    {isCertified: false},
    {subjectName: "物理", targetName: "物理A1"},
  ), "物理 · 物理A1：保存成功，当前为待教师确认；历史版本已保留");
});

test("screen save feedback describes restored certified revisions", () => {
  assert.equal(
    screenHomeworkSaveMessage({isCertified: true}),
    "作业：已恢复教师确认版本",
  );
});
