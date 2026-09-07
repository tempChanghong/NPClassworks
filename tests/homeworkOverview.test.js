import test from "node:test";
import assert from "node:assert/strict";
import {dailyHomeworkStatuses, hasNoHomeworkConflict, isNoHomework, NO_HOMEWORK_TITLE, NO_HOMEWORK_CONTENT, NO_HOMEWORK_META} from "../src/utils/noHomework.js";
import {deadlineBoardDate, groupHomeworkWeek, homeworkWeekStart, loadHomeworkWeek} from "../src/utils/homeworkWeek.js";
import {studentHomeworkCompletionStats, isStudentHomeworkCompleted, setStudentHomeworkCompleted} from "../src/utils/studentHomeworkCompletion.js";

const work = {id: "work", type: "ASSIGNMENT", status: "PUBLISHED", subjectId: "math", revision: 1,
  boardDate: "2026-09-07", title: "练习", content: "第十页", targets: [{workspaceId: "class"}]};
const marker = {...work, id: "marker", title: NO_HOMEWORK_TITLE, content: NO_HOMEWORK_CONTENT,
  contentJson: {...NO_HOMEWORK_META}, dueAt: null, isCertified: true};
const workspaces = [{id: "class", name: "一班", type: "ADMIN_CLASS", subjectRules: [{subjectId: "math", deliveryMode: "ADMIN_CLASS"}]},
  {id: "group", name: "数学走班", type: "COURSE_GROUP", subjectId: "math"}];
const subjects = [{id: "math", name: "数学"}];

test("no-homework declaration requires the explicit marker and remains safe after legacy text edits", () => {
  assert.equal(isNoHomework(marker), true);
  for (const override of [{contentJson: null}, {content: "又加了练习"}, {title: "练习"}, {dueAt: "2026-09-08T00:00:00Z"}, {type: "NOTICE"}]) {
    assert.equal(isNoHomework({...marker, ...override}), false);
  }
  assert.equal(isNoHomework({...marker, contentJson: {kind: "NO_HOMEWORK", version: 2}}), false);
});

test("subject status separates missing, declared, assigned and conflict within date and workspace", () => {
  const status = items => dailyHomeworkStatuses(items, workspaces, subjects, "2026-09-07");
  assert.deepEqual(status([]).map(row => row.state), ["unknown", "unknown"]);
  assert.deepEqual(status([marker]).map(row => row.state), ["none", "unknown"]);
  assert.equal(status([marker])[0].confirmed, true);
  assert.equal(status([{...marker, isCertified: false}])[0].confirmed, false);
  assert.deepEqual(status([work, marker]).map(row => row.state), ["conflict", "unknown"]);
  assert.equal(status([work, marker])[0].count, 1);
  assert.equal(status([work])[0].state, "assigned");
  assert.equal(status([{...marker, boardDate: "2026-09-08"}, {...marker, status: "DRAFT"}, {...marker, status: "WITHDRAWN"}])[0].state, "unknown");
  assert.deepEqual(status([{...marker, targets: [{workspaceId: "group"}]}]).map(row => row.state), ["unknown", "none"]);
  assert.equal(hasNoHomeworkConflict([work, marker], ["class"]), true);
  assert.equal(hasNoHomeworkConflict([work, marker], ["group"]), false);
  assert.equal(hasNoHomeworkConflict([{...work, boardDate: "2026-09-08"}, marker], ["class"]), false);
});

test("no-homework declarations never create or count local completion records", () => {
  const storage = {getItem: () => "{}", setItem: () => assert.fail("marker must not write a completion")};
  assert.deepEqual(setStudentHomeworkCompleted(marker, true, storage), {});
  assert.equal(isStudentHomeworkCompleted(marker, {marker: {revision: 1}}), false);
  assert.deepEqual(studentHomeworkCompletionStats([work, marker], {work: {revision: 1}}), {total: 1, completed: 1, updated: 0});
});

test("subject status uses available names and never exposes database IDs when the catalog is absent", () => {
  const namedWork = {...work, subject: {name: "数学"}};
  assert.equal(dailyHomeworkStatuses([namedWork], workspaces, [], "2026-09-07")[0].subject, "数学");
  assert.equal(dailyHomeworkStatuses([], [{...workspaces[1], subject: {id: "math", name: "走班数学"}}], [], "2026-09-07")[0].subject, "走班数学");
  assert.equal(dailyHomeworkStatuses([namedWork], workspaces, [{id: "math", name: "数学新名称"}], "2026-09-07")[0].subject, "数学新名称");
  assert.equal(dailyHomeworkStatuses([], workspaces, [], "2026-09-07")[0].subject, "科目名称暂不可用");
});

test("weeks start on Monday across years and deadlines use Beijing midnight", () => {
  assert.equal(homeworkWeekStart("2027-01-03"), "2026-12-28");
  assert.equal(homeworkWeekStart("2026-09-07"), "2026-09-07");
  assert.equal(deadlineBoardDate("2026-09-06T16:00:00Z"), "2026-09-07");
  assert.equal(deadlineBoardDate("2026-09-06T15:59:59Z"), "2026-09-06");
  assert.equal(deadlineBoardDate("bad"), "");
  const older = {...work, boardDate: "2026-09-01", dueAt: "2026-09-06T16:00:00Z"};
  const items = [older, marker, {...work, id: "draft", status: "DRAFT"}];
  const board = groupHomeworkWeek(items, "2026-09-07", "board");
  assert.equal(board.length, 7);
  assert.deepEqual(board[0].items, [marker]);
  assert.equal(board[0].count, 0);
  const due = groupHomeworkWeek(items, "2026-09-07", "due");
  assert.deepEqual(due[0].items, [older]);
  assert.equal(due[0].subjects, 1);
  assert.equal(groupHomeworkWeek(items, "2026-09-07", "due", "english")[0].items.length, 0);
});

const query = {weekStart: "2026-09-07", weekView: "board"};
test("week loader traverses all pages and deduplicates records", async () => {
  const calls = [];
  const result = await loadHomeworkWeek(async params => {
    calls.push(params);
    return {...query, total: 102, items: params.skip ? [{id: "99"}, {id: "100"}] : Array.from({length: 100}, (_, i) => ({id: String(i)}))};
  }, query);
  assert.deepEqual(calls.map(call => call.skip), [0, 100]);
  assert.equal(result.length, 101);
});

test("week loader rejects incompatible backend, incomplete pages and late cancelled responses", async () => {
  await assert.rejects(loadHomeworkWeek(async () => ({items: [], total: 0}), query), /后端尚不支持/);
  await assert.rejects(loadHomeworkWeek(async () => ({...query, items: []}), query), /不完整/);
  await assert.rejects(loadHomeworkWeek(async () => ({...query, items: [], total: 1}), query), /数据发生变化/);
  const controller = new AbortController();
  await assert.rejects(loadHomeworkWeek(async () => {
    controller.abort(); return {...query, items: [work], total: 1};
  }, query, controller.signal), /取消/);
});
