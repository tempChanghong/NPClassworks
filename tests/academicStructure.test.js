import test from "node:test";
import assert from "node:assert/strict";
import {buildSubjectRulePreset} from "../src/utils/academicStructure.js";

const subjects = [
  {id: "chinese", category: "CORE"},
  {id: "physics", category: "ELECTIVE"},
  {id: "chemistry", category: "ELECTIVE"},
  {id: "biology", category: "ELECTIVE"},
  {id: "history", category: "ELECTIVE"},
];

test("triple-fixed presets work for any administrative class and close unused electives", () => {
  const rules = buildSubjectRulePreset(subjects, "triple-fixed", ["physics", "chemistry", "biology"]);
  assert.equal(rules.chinese, "ADMIN_CLASS");
  assert.equal(rules.physics, "ADMIN_CLASS");
  assert.equal(rules.chemistry, "ADMIN_CLASS");
  assert.equal(rules.biology, "ADMIN_CLASS");
  assert.equal(rules.history, "NOT_OFFERED");
});

test("single-fixed presets keep every other elective available for walking classes", () => {
  const rules = buildSubjectRulePreset(subjects, "single-fixed", ["history"]);
  assert.equal(rules.history, "ADMIN_CLASS");
  assert.equal(rules.physics, "COURSE_GROUP");
  assert.equal(rules.chemistry, "COURSE_GROUP");
});

test("fixed-count presets reject incomplete selections", () => {
  assert.throws(() => buildSubjectRulePreset(subjects, "triple-fixed", ["physics"]), /3门选科/);
});

