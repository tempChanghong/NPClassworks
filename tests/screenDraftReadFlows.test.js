import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness} from "./helpers/flowHarness.js";

let h;
const key = "classworks-v2-screen-homework-draft:screen-a:new";
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

test("opening with failed draft reads blocks automatic writes and submissions, then restores original input", async t => {
  h.newStore({screen: true});
  h.drafts.saveScreenHomeworkDraft("screen-a", "new", {subjectId: "math", targetWorkspaceId: "class-a", content: "上次未提交的内容"});
  const raw = h.storage.getItem(key);
  const read = h.storage.getItem;
  const blocked = t.mock.method(h.storage, "getItem", name => {
    if (name === key) throw new Error("Read blocked");
    return read(name);
  });
  const {state, events} = await h.openComposer();
  assert.ok(state.draftReadError.value);
  assert.equal(state.draftReady.value, false);
  Object.assign(state.form, {subjectId: "math", targetWorkspaceId: "class-a", content: "不能覆盖原文"});
  await nextTick();
  assert.equal(state.canSave.value, false);
  await state.save();
  state.discardRecoveredDraft();
  assert.equal(h.requests.length, 0);
  assert.equal(read(key), raw);
  await state.restoreDraft();
  await nextTick();
  assert.equal(state.draftReady.value, false);
  assert.equal(read(key), raw);
  blocked.mock.restore();
  await state.restoreDraft();
  await nextTick();
  assert.equal(state.draftReadError.value, "");
  assert.equal(state.form.content, "上次未提交的内容");
  assert.equal(state.draftReady.value, true);
  state.form.content = "恢复后正常编辑";
  await nextTick();
  assert.equal(h.loadDraft("screen-a", "new").content, "恢复后正常编辑");
  await state.save();
  assert.equal(h.publications[0].content, "恢复后正常编辑");
  assert.ok(events.some(([name]) => name === "saved"));
  assert.equal(read(key), null);
});

test("closing and reopening an unreadable malformed draft never clears or overwrites it", async () => {
  h.newStore({screen: true});
  h.storage.setItem(key, "{broken");
  const {state, props, events} = await h.openComposer();
  assert.ok(state.draftReadError.value);
  state.requestVisibility(false);
  assert.deepEqual(events.at(-1), ["update:modelValue", false]);
  props.modelValue = false;
  await nextTick();
  props.modelValue = true;
  await nextTick();
  assert.ok(state.draftReadError.value);
  assert.equal(state.draftReady.value, false);
  assert.equal(h.storage.getItem(key), "{broken");
});

test("opening an expired draft still deletes it after seven days and allows a fresh input", async () => {
  h.newStore({screen: true});
  h.drafts.saveScreenHomeworkDraft("screen-a", "new", {content: "八天前"}, h.storage, Date.now() - 8 * 86400000);
  const {state} = await h.openComposer();
  assert.equal(h.storage.getItem(key), null);
  assert.equal(state.form.content, "");
  assert.equal(state.draftReadError.value, "");
  assert.equal(state.draftReady.value, true);
});
