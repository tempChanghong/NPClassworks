import {test} from "node:test";
import assert from "node:assert/strict";
import {templateFields, fillHomeworkTemplate} from "../src/utils/homeworkTemplates.js";

test("template placeholders repeat literally, preserve newlines and never copy publication metadata", () => {
  const template = {title: "练习〔页码〕", content: "完成〔页码〕\n〔__proto__〕", boardDate: "2000-01-01", targetWorkspaceIds: ["old"], dueAt: "old"};
  assert.deepEqual(templateFields(template), ["页码", "__proto__"]);
  assert.deepEqual(fillHomeworkTemplate(template, new Map([["页码", "$&"], ["__proto__", "<script>文字</script>"]])),
    {title: "练习$&", content: "完成$&\n<script>文字</script>", submission: "", materials: ""});
});
test("template filling rejects missing, malformed and oversized results", () => {
  assert.throws(() => fillHomeworkTemplate({content: "〔题号〕"}, new Map()), /全部/);
  assert.throws(() => templateFields({content: "〔题号"}), /格式/);
  assert.throws(() => templateFields({content: Array.from({length: 11}, (_, i) => `〔${i}〕`).join("")}), /最多10/);
  assert.throws(() => fillHomeworkTemplate({title: "〔题号〕"}, new Map([["题号", "题".repeat(192)]])), /191/);
  assert.throws(() => fillHomeworkTemplate({content: "〔题号〕〔题号〕"}, new Map([["题号", "题".repeat(3001)]])), /6000/);
});
