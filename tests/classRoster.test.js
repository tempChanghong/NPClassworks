import test from "node:test";
import assert from "node:assert/strict";
import {importRoster, rosterChanges, validateRoster} from "../src/utils/classRoster.js";

const original = [{id: "a", studentNumber: "01", name: "张三"}, {id: "b", studentNumber: "02", name: "李四"}];
test("roster paste defaults to append, preserves identities on rename and previews removal", () => {
  const appended = importRoster("01\t张小三\n03 王五", original);
  assert.equal(appended[0].id, "a");
  assert.equal(appended[1].id, "b");
  assert.equal(appended.length, 3);
  const replaced = importRoster("01 张小三", original, "replace");
  assert.deepEqual(rosterChanges(original, replaced), ["修改：01 张三 → 01 张小三", "移出：02 李四（保留历史记录）"]);
});
test("invalid and ambiguous imports fail without mutating the original roster", () => {
  assert.throws(() => importRoster("01 甲\n01 乙", original), /重复/);
  assert.throws(() => importRoster("张三", [{id: "a", name: "张三"}, {id: "b", name: "张三"}]), /同名/);
  assert.throws(() => validateRoster([{name: " "}]), /不能为空/);
  assert.throws(() => validateRoster(Array.from({length: 121}, () => ({name: "甲"}))), /120/);
  assert.equal(original[0].name, "张三");
});
