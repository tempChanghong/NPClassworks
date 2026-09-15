import assert from "node:assert/strict";
import test from "node:test";
import {homeworkTextDocument, homeworkTextSubjects} from "../src/utils/homeworkText.js";
import {homeworkPrintSnapshot} from "../src/utils/homeworkPrint.js";

const work = {id: "one", type: "ASSIGNMENT", status: "PUBLISHED", subject: {name: "数学"}, boardDate: "2026-09-06",
  publishAt: "2026-09-06T00:00:00Z", dueAt: "2026-09-07T08:00:00Z", title: "练习", content: "第一题\n第二题",
  targets: [{workspaceId: "class-a", workspace: {name: "一班"}}],
  contentJson: {optionalContent: "挑战题", submission: "交课代表", preparation: {text: "圆规", date: "2026-09-07"}}};
const snapshot = () => homeworkPrintSnapshot({publications: [work, {...work, id: "none", subject: {name: "语文"},
  dueAt: null, title: "今日无作业", content: "本日该科目无作业。", contentJson: {kind: "NO_HOMEWORK", version: 1}, isCertified: true}],
  preparations: [{...work, id: "prep", subject: {name: "物理"}}], workspaceIds: ["class-a"], boardDate: "2026-09-06", className: "一班",
  generatedAt: "2026-09-06T08:00:00Z", now: new Date("2026-09-06T08:00:00Z"), cached: true, warning: "本机还有待上传作业"});

test("text sharing preserves instructions, dates, no-homework, certification and cache warnings", () => {
  const text = homeworkTextDocument(snapshot());
  for (const value of ["一班", "2026-09-06", "必做：\n第一题\n第二题", "选做：\n挑战题", "提交说明：交课代表", "2026-09-07 需带：圆规", "截止：2026/09/07", "今日无作业", "待教师确认", "教师已确认", "离线缓存内容", "本机还有待上传作业"]) assert.ok(text.includes(value), value);
  assert.ok(!text.includes("必做：\n必做："));
});
test("subject selection covers preparation-only subjects and removes excluded content without changing the source", () => {
  const source = snapshot(), before = JSON.stringify(source);
  assert.deepEqual(new Set(homeworkTextSubjects(source)), new Set(["数学", "语文", "物理"]));
  const text = homeworkTextDocument(source, ["语文"]);
  assert.match(text, /今日无作业/);
  for (const value of ["第一题", "挑战题", "圆规", "物理", "数学"]) assert.ok(!text.includes(value), value);
  assert.equal(JSON.stringify(source), before);
  assert.match(homeworkTextDocument(source, []), /请先选择/);
});
test("plain text is not HTML-escaped or truncated and never serializes extra source fields", () => {
  const source = snapshot(), content = "<script>字面文本</script> & 😀\n".repeat(500);
  source.items[0].content = content; source.items[0].optionalContent = "";
  source.secret = "never-copy-me"; source.items[0].secret = "never-copy-me";
  const text = homeworkTextDocument(source);
  assert.ok(text.includes(content)); assert.ok(!text.includes("never-copy-me"));
  assert.match(homeworkTextDocument({...source, items: [], preparations: []}, ["数学"]), /不代表无作业/);
});
