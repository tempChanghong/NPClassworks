import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicateAssignmentDescription,
  publicationDuplicateState,
} from "../src/utils/publicationDuplicate.js";

test("only duplicate assignment responses enter the duplicate confirmation flow", () => {
  assert.equal(publicationDuplicateState({response: {data: {code: "OTHER"}}}), null);
  assert.deepEqual(publicationDuplicateState({response: {data: {
    code: "DUPLICATE_ASSIGNMENT_SUSPECTED",
    message: "疑似重复",
    details: {duplicates: [{id: "p1"}]},
  }}}), {message: "疑似重复", duplicates: [{id: "p1"}]});
});

test("duplicate descriptions identify target, source and content", () => {
  assert.equal(duplicateAssignmentDescription({
    targets: [{name: "物理A1"}],
    sourceName: "高二3班一体机",
    content: "完成练习册第十页",
  }), "物理A1 · 高二3班一体机 · 完成练习册第十页");
});
