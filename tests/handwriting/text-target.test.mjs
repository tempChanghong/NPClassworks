import {test} from "node:test";
import assert from "node:assert/strict";
import {createTextInputTarget} from "../../src/utils/textInputTarget.js";
function fixture() {
  const state = {value: "完成第12—15页", context: ["class-a", "math", 1], disabled: false};
  const target = createTextInputTarget({read: () => state.value, write: text => { state.value = text; }, context: () => state.context,
    limit: 6000,
    textarea: () => ({selectionStart: 3, selectionEnd: 5}), disabled: () => state.disabled});
  return {state, target};
}
test("confirmed text replaces only the captured range and can be undone", () => { const {state, target} = fixture(); const edit = target.apply(target.capture(), "20"); assert.equal(state.value, "完成第20—15页"); target.undo(edit); assert.equal(state.value, "完成第12—15页"); });
for (const mode of ["class", "publication", "text", "disabled"]) test(`late async text cannot enter changed ${mode}`, () => {
  const {state, target} = fixture(), snapshot = target.capture();
  if (mode === "class") state.context[0] = "class-b";
  if (mode === "publication") state.context[2] = 2;
  if (mode === "text") state.value += "，新增";
  if (mode === "disabled") state.disabled = true;
  assert.throws(() => target.apply(snapshot, "99"));
});
test("one confirmation is consumed once and undo cannot erase later typing", () => { const {state, target} = fixture(), snapshot = target.capture(), edit = target.apply(snapshot, "20"); assert.throws(() => target.apply(snapshot, "20")); state.value += "，新增"; assert.throws(() => target.undo(edit)); });
test("over-limit and empty input leave original text and snapshot usable", () => { const {state, target} = fixture(), snapshot = target.capture(); assert.throws(() => target.apply(snapshot, " ")); assert.throws(() => target.apply(snapshot, "字".repeat(6001))); assert.equal(state.value, snapshot.value); assert.ok(target.apply(snapshot, "20")); });
test("insertion preserves confirmed separators instead of joining question numbers", () => {
  const state = {value: "题号12"};
  const target = createTextInputTarget({read: () => state.value, write: text => { state.value = text; }, context: () => ["class-a"],
    textarea: () => ({selectionStart: state.value.length, selectionEnd: state.value.length}), disabled: () => false});
  const edit = target.apply(target.capture(), " 15\r\n");
  assert.equal(state.value, "题号12 15\n"); assert.equal(edit.cursor, state.value.length);
  target.undo(edit); assert.equal(state.value, "题号12");
});
test("replacement retains leading/trailing newlines and counts them toward the limit", () => {
  let value = "正文：旧题结束";
  const target = createTextInputTarget({read: () => value, write: text => { value = text; }, context: () => ["class-a"],
    textarea: () => ({selectionStart: 3, selectionEnd: 5}), disabled: () => false, limit: 12});
  const snapshot = target.capture();
  assert.throws(() => target.apply(snapshot, "\n1234567\n"), /超过/); assert.equal(value, snapshot.value);
  const edit = target.apply(snapshot, "\r\n第1题\r");
  assert.equal(value, "正文：\n第1题\n结束"); assert.equal(edit.cursor, 8);
  target.undo(edit); assert.equal(value, snapshot.value);
});

test("confirmed text restores focus and cursor only while it still owns the field", () => {
  let value = "题号", disabled = false;
  const calls = [], element = {selectionStart: 2, selectionEnd: 2,
    focus: options => calls.push(["focus", options]), setSelectionRange: (...range) => calls.push(["range", ...range])};
  const target = createTextInputTarget({read: () => value, write: text => { value = text; },
    context: () => ["class-a"], textarea: () => element, disabled: () => disabled});
  const edit = target.apply(target.capture(), "第8题");
  assert.equal(target.restoreSelection(edit), true);
  assert.deepEqual(calls, [["focus", {preventScroll: true}], ["range", 5, 5]]);
  calls.length = 0;
  disabled = true; assert.equal(target.restoreSelection(edit), false);
  disabled = false; value += "后续输入"; assert.equal(target.restoreSelection(edit), false);
  assert.deepEqual(calls, []);
});
