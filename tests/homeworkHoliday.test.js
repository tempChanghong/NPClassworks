import {test} from "node:test";
import assert from "node:assert/strict";
import {loadHolidayHomework, holidayDefaultSelection, holidayPrintSnapshot, validateHolidayRange} from "../src/utils/homeworkHoliday.js";
import {homeworkPrintDocument} from "../src/utils/homeworkPrint.js";
import {planHomeworkImages} from "../src/utils/homeworkImages.js";
import {withOptionalHomework, requiredHomeworkContent} from "../src/utils/homeworkInstructions.js";
import {fillHomeworkTemplate} from "../src/utils/homeworkTemplates.js";
import {filterTeacherPublications} from "../src/utils/teacherPublications.js";
const item = (id, boardDate, dueAt) => ({id, type: "ASSIGNMENT", status: "PUBLISHED", boardDate, dueAt,
  subject: {name: "数学"}, content: "前五题", contentJson: {optionalContent: "<script>拓展题</script>"},
  targets: [{workspaceId: "class", workspace: {name: "一班"}}], publishAt: "2026-09-01T00:00:00Z", isCertified: false});

test("holiday merges paginated board and due searches including assignments set before the search window", async () => {
  const earlier = item("old", "2026-08-01", "2026-10-03T00:00:00Z"), prior = item("prior", "2026-09-30"), inside = item("in", "2026-10-02");
  const calls = [];
  const result = await loadHolidayHomework(async params => {
    calls.push(params);
    const rows = params.weekView === "due" ? [earlier] : [prior, inside];
    return {...params, items: rows.slice(params.skip, params.skip + 1), total: rows.length};
  }, {start: "2026-10-01", end: "2026-10-07", searchStart: "2026-09-30"});
  assert.deepEqual(new Set(result.map(row => row.id)), new Set(["old", "prior", "in"]));
  assert.deepEqual(new Set(holidayDefaultSelection(result, "2026-10-01", "2026-10-07")), new Set(["old", "in"]));
  assert.ok(calls.some(call => call.skip === 1));
  const snapshot = holidayPrintSnapshot({items: result, selectedIds: ["prior", "prior", "in"], start: "2026-10-01", end: "2026-10-07", title: "国庆作业",
    workspaceIds: ["class"], className: "一班", now: new Date("2026-10-08"), generatedAt: new Date("2026-10-08")});
  assert.equal(snapshot.items.length, 2);
  assert.match(snapshot.items[0].content, /必做/);
  const html = homeworkPrintDocument(snapshot);
  assert.match(html, /国庆作业/); assert.match(html, /选做：&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.ok(planHomeworkImages(snapshot, text => String(text).length * 15).length);
});

test("holiday never exports partial results and rejects excessive or invalid date ranges", async () => {
  for (const args of [["2026-02-30", "2026-03-01", "2026-02-01"], ["2026-10-02", "2026-10-01", "2026-09-01"], ["2026-10-01", "2026-10-07", "2026-01-01"]]) assert.throws(() => validateHolidayRange(...args));
  let count = 0;
  await assert.rejects(loadHolidayHomework(async params => {
    if (++count === 2) throw new Error("offline");
    return {...params, items: [item("one", "2026-10-01")], total: 2};
  }, {start: "2026-10-01", end: "2026-10-07", searchStart: "2026-10-01"}), /offline/);
});

test("optional homework can be cleared, filled in templates and does not change ordinary content", () => {
  assert.equal(filterTeacherPublications([item("one", "2026-09-14")], {query: "拓展题"}).length, 1);
  assert.equal(requiredHomeworkContent({type: "ASSIGNMENT", content: "原正文"}), "原正文");
  assert.deepEqual(withOptionalHomework({optionalContent: "旧", submission: "交给老师"}, ""), {submission: "交给老师"});
  assert.throws(() => withOptionalHomework({}, "长".repeat(6001)));
  assert.equal(fillHomeworkTemplate({content: "基础题", optionalContent: "拓展〔题号〕"}, new Map([["题号", "6"]])).optionalContent, "拓展6");
});
