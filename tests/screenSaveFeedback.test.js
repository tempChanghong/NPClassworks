import test from "node:test";
import assert from "node:assert/strict";
import {
  screenHomeworkSaveFeedback,
  screenHomeworkSaveMessage,
  teacherPublicationSaveFeedback,
} from "../src/utils/screenSaveFeedback.js";

test("screen save feedback names the subject, target and pending certification state", () => {
  assert.equal(screenHomeworkSaveMessage(
    {isCertified: false, priority: "IMPORTANT", revision: 2},
    {subjectName: "物理", targetName: "物理A1", operation: "updated"},
  ), "重要作业修改已保存；当前状态：待教师确认 · 版本 2 · 物理 · 物理A1 · 历史版本已保留");
});

test("screen save feedback describes restored certified revisions", () => {
  assert.equal(
    screenHomeworkSaveMessage({isCertified: true, priority: "NORMAL", revision: 4}),
    "普通作业已恢复；当前状态：教师已确认 · 版本 4 · 发布目标",
  );
});

test("teacher feedback distinguishes assignment drafts from published notices", () => {
  assert.deepEqual(teacherPublicationSaveFeedback({
    type: "ASSIGNMENT",
    priority: "NORMAL",
    status: "DRAFT",
    revision: 1,
    targets: [{workspace: {name: "高二1班"}}],
  }), {
    title: "普通作业草稿已保存",
    detail: "当前状态：尚未发布 · 版本 1 · 高二1班",
    color: "info",
    icon: "mdi-file-edit-outline",
  });
  assert.equal(teacherPublicationSaveFeedback({
    type: "NOTICE",
    priority: "URGENT",
    status: "PUBLISHED",
    revision: 3,
    publishAt: "2026-08-18T08:00:00.000Z",
    targets: [{workspace: {name: "高二年级"}}],
  }, {operation: "updated", now: new Date("2026-08-18T09:00:00.000Z")}).title, "紧急通知修改已保存");
});

test("scheduled teacher publications report the display time explicitly", () => {
  const feedback = teacherPublicationSaveFeedback({
    type: "ASSIGNMENT",
    priority: "IMPORTANT",
    status: "PUBLISHED",
    revision: 1,
    publishAt: "2026-08-19T00:00:00.000Z",
  }, {now: new Date("2026-08-18T00:00:00.000Z")});
  assert.equal(feedback.title, "重要作业已安排发布");
  assert.match(feedback.detail, /教师已确认/);
  assert.match(feedback.detail, /自动显示/);
});

test("screen feedback exposes color and icon for pending certification", () => {
  const feedback = screenHomeworkSaveFeedback({isCertified: false, priority: "URGENT", revision: 1});
  assert.equal(feedback.color, "warning");
  assert.equal(feedback.icon, "mdi-clock-alert-outline");
});

test("offline screen saves explain that submission is still pending", () => {
  const feedback = screenHomeworkSaveFeedback({offlineQueued: true}, {
    subjectName: "物理",
    targetName: "物理A1",
  });
  assert.equal(feedback.title, "作业已保存在本机");
  assert.match(feedback.detail, /网络恢复后将自动提交/);
});
