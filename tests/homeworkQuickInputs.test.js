import test from "node:test";
import assert from "node:assert/strict";
import {
  filterHomeworkQuickInputs,
  insertHomeworkQuickInput,
  sanitizeHomeworkQuickInputs,
} from "../src/utils/homeworkQuickInputs.js";

test("quick inputs preserve an intentional empty school configuration", () => {
  assert.deepEqual(sanitizeHomeworkQuickInputs([]), []);
});

test("quick inputs combine common words with the selected subject", () => {
  const items = [
    {label: "完成", text: "完成", subjectIds: []},
    {label: "朗读", text: "朗读", subjectIds: ["chinese"]},
    {label: "计算", text: "计算", subjectIds: ["math"]},
  ];
  assert.deepEqual(filterHomeworkQuickInputs(items, "chinese").map((item) => item.label), ["完成", "朗读"]);
  assert.deepEqual(filterHomeworkQuickInputs(items, "").map((item) => item.label), ["完成"]);
});

test("quick input replaces the active selection and returns the new cursor", () => {
  assert.deepEqual(
    insertHomeworkQuickInput("完成旧作业", 2, 3, {text: "新", insertMode: "INLINE"}),
    {value: "完成新作业", cursor: 3},
  );
});

test("newline quick input avoids creating a duplicate adjacent newline", () => {
  assert.deepEqual(
    insertHomeworkQuickInput("第一条\n第二条", 3, 3, {text: "", insertMode: "NEW_LINE"}),
    {value: "第一条\n第二条", cursor: 3},
  );
});
