import assert from "node:assert/strict";
import test from "node:test";
import {homeworkPrintDocument, homeworkPrintSnapshot} from "../src/utils/homeworkPrint.js";

const assignment = {id: "work", type: "ASSIGNMENT", status: "PUBLISHED", boardDate: "2026-09-06",
  publishAt: "2026-09-06T00:00:00Z", subject: {name: "数学"}, title: "练习", content: "第一题\n第二题",
  targets: [{workspaceId: "a", workspace: {name: "一班"}}, {workspaceId: "b", workspace: {name: "二班"}}]};
const options = {publications: [assignment], workspaceIds: ["a"], boardDate: "2026-09-06",
  className: "一班", scopeLabel: "行政班及所选走班", now: new Date("2026-09-06T08:00:00Z")};

test("print snapshot includes only published assignments for the selected date and workspaces", () => {
  const snapshot = homeworkPrintSnapshot({...options, publications: [assignment, assignment,
    {...assignment, id: "notice", type: "NOTICE"}, {...assignment, id: "draft", status: "DRAFT"},
    {...assignment, id: "withdrawn", status: "WITHDRAWN"}, {...assignment, id: "yesterday", boardDate: "2026-09-05"},
    {...assignment, id: "other", targets: [{workspaceId: "c"}]},
    {...assignment, id: "future", publishAt: "2026-09-07T00:00:00Z"},
  ]});
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].targets, "一班");
  assert.equal(snapshot.items[0].certification, "待教师确认");
  assert.equal(snapshot.items[0].content, "第一题\n第二题");
  assert.equal(homeworkPrintSnapshot({...options, workspaceIds: []}).items.length, 0);
});

test("print document escapes all supplied text and includes no external content or raw publication fields", () => {
  const injection = '</p><script>alert("x")</script><img src="https://example.com/leak">';
  const snapshot = homeworkPrintSnapshot({...options, className: injection, scopeLabel: injection, warning: injection,
    publications: [{...assignment, title: injection, content: injection, subject: {name: injection},
      targets: [{workspaceId: "a", workspace: {name: injection}}], secret: "never-print-this", isCertified: true}]});
  const html = homeworkPrintDocument(snapshot);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("never-print-this"));
  assert.ok(html.includes("教师已确认"));
});

test("cache and pending warnings remain on paper and long multiline content is not truncated", () => {
  const content = "很长的作业内容\n".repeat(500);
  const snapshot = homeworkPrintSnapshot({...options, cached: true, warning: "还有未上传作业",
    publications: [{...assignment, content, dueAt: "2026-09-07T08:00:00Z", priority: "IMPORTANT"}]});
  const html = homeworkPrintDocument(snapshot);
  assert.ok(html.includes(content));
  assert.ok(html.includes("离线缓存内容"));
  assert.ok(html.includes("还有未上传作业"));
  assert.ok(html.includes("截止：2026"));
  assert.ok(html.includes("重要"));
  assert.ok(!homeworkPrintDocument(homeworkPrintSnapshot(options)).includes('<p class="warning">'));
});

test("snapshot is detached from live updates and handles an empty day", () => {
  const item = globalThis.structuredClone(assignment);
  const snapshot = homeworkPrintSnapshot({...options, publications: [item]});
  item.content = "后续更正";
  assert.equal(snapshot.items[0].content, assignment.content);
  assert.match(homeworkPrintDocument(homeworkPrintSnapshot({...options, publications: []})), /没有该日期的作业/);
});
