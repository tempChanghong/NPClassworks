import {test} from "node:test";
import assert from "node:assert/strict";
import {loadTomorrowHomework, tomorrowPrintSnapshot} from "../src/utils/homeworkTomorrow.js";
import {homeworkPrintDocument} from "../src/utils/homeworkPrint.js";
import {planHomeworkImages} from "../src/utils/homeworkImages.js";

const now = new Date("2026-09-14T15:59:00Z");
const item = (id, fields = {}) => ({id, type: "ASSIGNMENT", status: "PUBLISHED", boardDate: "2026-09-14", content: id,
  subject: {name: "数学"}, targets: [{workspaceId: "class", workspace: {name: "一班"}}],
  publishAt: "2026-09-01T00:00:00Z", ...fields});
const day = (items = [], preparations = []) => ({boardDate: "2026-09-14", includesPreparations: true, items, preparations});
const load = (board, rows, extra = {}) => loadTomorrowHomework({now, workspaceIds: ["class"], loadDay: async () => board,
  loadWeek: async params => ({...params, items: rows.slice(params.skip, params.skip + 1), total: rows.length}), ...extra});

test("tomorrow uses Beijing boundaries, includes old due work across pages and isolates missing deadlines", async () => {
  const first = item("old", {boardDate: "2026-07-01", dueAt: "2026-09-14T16:00:00Z"});
  const last = item("last", {dueAt: "2026-09-15T15:59:59Z"});
  const excluded = [item("today", {dueAt: "2026-09-14T15:59:59Z"}), item("later", {dueAt: "2026-09-15T16:00:00Z"}),
    item("draft", {...first, id: "draft", status: "DRAFT"}), item("other", {...first, id: "other", targets: [{workspaceId: "other"}]}),
    item("scheduled", {...first, id: "scheduled", publishAt: "2026-10-01"}), item("withdrawn", {...first, id: "withdrawn", status: "WITHDRAWN"})];
  const pack = item("pack", {boardDate: "2026-07-01", contentJson: {preparation: {text: "<圆规>", date: "2026-09-15"}}});
  const result = await load(day([item("unknown"), item("historical-unknown", {boardDate: "2026-09-13"}),
    item("none", {title: "今日无作业", content: "本日该科目无作业。", contentJson: {kind: "NO_HOMEWORK", version: 1}})],
  [pack, pack, item("future-pack", {contentJson: {preparation: {text: "后天的物品", date: "2026-09-16"}}})]), [first, last, ...excluded, first]);
  assert.equal(result.tomorrow, "2026-09-15");
  assert.deepEqual(result.due.map(i => i.id), ["old", "last"]);
  assert.deepEqual(result.unknown.map(i => i.id), ["unknown"]);
  assert.deepEqual(result.preparations.map(i => i.id), ["pack"]);
  const nextDay = await loadTomorrowHomework({now: new Date("2026-09-14T16:00:00Z"), workspaceIds: ["class"],
    loadDay: async date => ({...day(), boardDate: date}), loadWeek: async params => ({...params, items: [], total: 0})});
  assert.equal(nextDay.tomorrow, "2026-09-16");
});

test("tomorrow export preserves group labels, submission, optional content and preparation in print and every image page", async () => {
  const due = item("early", {boardDate: "2026-06-01", dueAt: "2026-09-15T00:00:00Z", content: "必做长正文\n".repeat(150),
    contentJson: {submission: "早读前交给课代表", optionalContent: "<选做拓展>", preparation: {text: "圆规", date: "2026-09-15"}}});
  const result = await load(day([item("待核对")], [due]), [due]);
  const snapshot = tomorrowPrintSnapshot({checklist: result, workspaceIds: ["class"], className: "一班", generatedAt: now, now});
  const html = homeworkPrintDocument(snapshot);
  for (const text of ["明日要交", "截止未设置，请核对", "2026-06-01", "早读前交给课代表", "圆规", "&lt;选做拓展&gt;"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("<选做拓展>"));
  const pages = planHomeworkImages(snapshot, text => String(text).length * 14);
  assert.ok(pages.length > 1);
  const text = pages.flatMap(page => page.rows.map(row => row.text)).join("");
  for (const part of ["明日要交", "截止未设置，请核对", "早读前交给课代表", "圆规", "<选做拓展>", "待核对"]) assert.ok(text.includes(part), part);
});

test("tomorrow fails closed on incomplete day support, page failure or cancellation", async () => {
  await assert.rejects(load({...day(), includesPreparations: false}, []), /数据不完整/);
  let calls = 0;
  await assert.rejects(load(day(), [], {loadWeek: async params => {
    if (++calls > 1) throw new Error("offline");
    return {...params, items: [item("one")], total: 2};
  }}), /offline/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadTomorrowHomework({now, workspaceIds: ["class"], loadDay: async () => day(), loadWeek: async () => {throw new Error("must not run");}}, controller.signal), /取消/);
});

test("tomorrow rejects contradictory revisions across board and due queries", async () => {
  const old = item("edited", {revision: 1, dueAt: null, contentJson: {preparation: {text: "旧物品", date: "2026-09-15"}}});
  const updated = {...old, revision: 2, dueAt: "2026-09-15T00:00:00Z", contentJson: null};
  await assert.rejects(load(day([old], [old]), [updated]), /版本.*变化|变化.*版本/);
  await assert.rejects(load(day([updated], []), [old]), /版本.*变化|变化.*版本/);
  await assert.rejects(load(day(), [old, updated]), /版本.*变化|变化.*版本/);
  const consistent = await load(day([updated], []), [updated]);
  assert.deepEqual(consistent.due.map(row => row.id), ["edited"]);
  assert.equal(consistent.unknown.length, 0);
});
