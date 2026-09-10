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

for (const mode of ["append", "replace"]) {
  test(`${mode}: tab-separated columns preserve empty numbers and names containing spaces`, () => {
    const existing = [{id: "a", name: "欧阳 小明", studentNumber: ""}];
    const result = importRoster("\t欧阳 小明\r\n03\t王 五\r\n\t\r\n", existing, mode);
    assert.deepEqual(result, [
      {id: "a", name: "欧阳 小明", studentNumber: ""},
      {name: "王 五", studentNumber: "03"},
    ]);
    assert.deepEqual(existing, [{id: "a", name: "欧阳 小明", studentNumber: ""}]);
  });

  test(`${mode}: missing names and extra spreadsheet columns fail without changing the draft`, () => {
    const existing = globalThis.structuredClone(original);
    for (const text of ["03\t", "03\t  ", "01\t张小三\n03\t", "03\t王五\t备注"]) {
      assert.throws(() => importRoster(text, existing, mode), /姓名|两列/);
      assert.deepEqual(existing, original);
    }
  });

  test(`${mode}: ambiguous unnumbered names cannot merge while numbered names keep separate identities`, () => {
    for (const existing of [[], [{id: "s1", name: "张三", studentNumber: ""}]]) {
      const before = globalThis.structuredClone(existing);
      assert.throws(() => importRoster("\t张三\n\t 张三 ", existing, mode), /同名.*学号/);
      assert.throws(() => importRoster("张三\n张三", existing, mode), /同名.*学号/);
      assert.deepEqual(existing, before);
    }
    const numbered = [{id: "s1", name: "张三", studentNumber: "01"}, {id: "s2", name: "张三", studentNumber: "02"}];
    assert.deepEqual(importRoster("01\t张三\n02\t张三", numbered, mode), numbered);
    assert.equal(importRoster("\t张三\n01\t张三", [], mode).length, 2);
  });
}

test("manual editing still permits distinct unnumbered students with the same name", () => {
  const students = [{id: "s1", name: "张三", studentNumber: ""}, {id: "s2", name: "张三", studentNumber: ""}];
  assert.deepEqual(validateRoster(students), students);
});
