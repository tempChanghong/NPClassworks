import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());
const publication = id => ({id, revision: 1, type: "ASSIGNMENT", status: "PUBLISHED", subjectId: "math",
  title: id, content: `${id}原文`, priority: "NORMAL", boardDate: "2026-09-10", publishAt: "2026-09-10T00:00:00Z",
  targets: [{workspaceId: "class-a"}]});
async function editor() {
  const store = h.newStore();
  store.eligibleTeacherWorkspaces = () => [h.workspace, {...h.workspace, id: "class-b"}];
  const component = await h.openComponent("/src/components/v2/PublicationComposer.vue", {editingPublication: publication("A")});
  await nextTick();
  return {store, ...component};
}

for (const outcome of ["success", "failure", "conflict"]) {
  test(`a delayed ${outcome} from A cannot replace B's input or error state`, async () => {
    const {store, state: s, props, events} = await editor();
    const gate = deferred();
    const remembered = [];
    store.rememberTeacherTargetCombination = value => remembered.push(value);
    store.updatePublication = async () => {
      await gate.promise;
      if (outcome !== "success") throw {response: {status: outcome === "conflict" ? 409 : 503,
        data: {code: "PUBLICATION_REVISION_CONFLICT", message: "A保存失败"}}};
      return {...publication("A"), revision: 2};
    };
    let latestReads = 0;
    store.latestPublication = async () => { latestReads++; return publication("A"); };
    const pending = s.submit("PUBLISHED");
    props.editingPublication = publication("B");
    await nextTick();
    s.form.content = "B的新输入";
    s.form.targetWorkspaceIds = ["class-b"];
    s.localError.value = "B自己的提示";
    gate.resolve(); await pending;
    assert.equal(s.form.content, "B的新输入");
    assert.equal(s.localError.value, "B自己的提示");
    assert.equal(s.conflict.value, null);
    assert.equal(latestReads, 0);
    if (outcome === "success") {
      assert.deepEqual(remembered[0].targetWorkspaceIds, ["class-a"]);
      assert.equal(events.find(event => event[0] === "published")[2].clearEditor, false);
    }
  });
}

test("typing while saving retains unsaved text and the next save uses the returned revision", async () => {
  const {store, state: s} = await editor();
  const gate = deferred();
  const writes = [];
  store.updatePublication = async (base, input) => {
    writes.push({base: {...base}, input: JSON.parse(JSON.stringify(input))});
    if (writes.length === 1) await gate.promise;
    return {...publication("A"), ...input, revision: base.revision + 1};
  };
  s.form.content = "提交时的内容";
  const pending = s.submit("PUBLISHED");
  await nextTick();
  s.form.content = "提交后继续输入";
  gate.resolve(); await pending;
  assert.equal(s.form.content, "提交后继续输入");
  assert.notEqual(s.cleanForm.value, JSON.stringify(s.form));
  await s.submit("PUBLISHED");
  assert.equal(writes[1].base.revision, 2);
  assert.equal(writes[1].input.content, "提交后继续输入");
});

test("a new publication keeps later input as an edit of the saved ID and rejects overlapping submits", async () => {
  const {store, state: s, props} = await editor();
  props.editingPublication = null; await nextTick();
  Object.assign(s.form, {subjectId: "math", targetWorkspaceIds: ["class-a"], title: "新作业", content: "提交内容"});
  await nextTick();
  const gate = deferred();
  let creates = 0, updated;
  store.publish = async input => { creates++; await gate.promise; return {...publication("new"), ...input}; };
  store.updatePublication = async (base, input) => { updated = {base, input}; return {...base, ...input, revision: 2}; };
  const pending = s.submit("DRAFT");
  await s.submit("PUBLISHED");
  s.form.content = "未保存后续内容";
  gate.resolve(); await pending;
  assert.equal(creates, 1);
  assert.equal(s.form.content, "未保存后续内容");
  await s.submit("PUBLISHED");
  assert.equal(creates, 1);
  assert.equal(updated.base.id, "new");
  assert.equal(updated.input.content, "未保存后续内容");
});

test("a late conflict detail response cannot reopen a conflict after switching editors", async () => {
  const {store, state: s, props} = await editor();
  const gate = deferred();
  let reading = false;
  store.updatePublication = async () => { throw {response: {status: 409, data: {
    code: "PUBLICATION_REVISION_CONFLICT", details: {revision: 2}, message: "版本冲突",
  }}}; };
  store.latestPublication = async () => { reading = true; await gate.promise; return {...publication("A"), revision: 2}; };
  const pending = s.submit("PUBLISHED");
  await eventually(() => assert.equal(reading, true));
  props.editingPublication = publication("B"); await nextTick();
  s.form.content = "B保留";
  gate.resolve(); await pending;
  assert.equal(s.form.content, "B保留");
  assert.equal(s.conflict.value, null);
  assert.equal(s.localError.value, "");
});

test("saving a conflict copy cannot mark later form edits as saved", async () => {
  const {store, state: s} = await editor();
  s.conflictInput.value = {content: "冲突时输入", targetWorkspaceIds: ["class-a"]};
  s.conflictFormSnapshot.value = JSON.stringify(s.form);
  s.form.content = "冲突提示后又改了";
  store.publish = async input => ({...publication("copy"), ...input, status: "DRAFT"});
  await s.saveConflictCopy();
  assert.equal(s.form.content, "冲突提示后又改了");
  assert.notEqual(s.cleanForm.value, JSON.stringify(s.form));
  assert.equal(s.editingBase.value.id, "copy");
});

test("failed attendance reads cannot turn a cached roster into a writable empty record", async () => {
  const store = h.newStore({screen: true});
  store.classroomStudents = [{id: "s1", name: "张三"}];
  store.classroomAttendance = {absent: ["s1"], late: [], excluded: []};
  const {state: s, props} = await h.openComponent("/src/components/v2/ClassroomToolsDialog.vue", {modelValue: false});
  const path = `/api/v2/classroom-screens/attendance/${s.today()}`;
  let saved = JSON.parse(JSON.stringify(store.classroomAttendance));
  h.routes.set("GET /api/v2/classroom-screens/students", (_req, reply) => reply(store.classroomStudents));
  h.routes.set(`GET ${path}`, (_req, reply) => reply({message: "读取失败"}, 503));
  h.routes.set(`PUT ${path}`, (req, reply) => { saved = req.body; reply(saved); });
  props.modelValue = true; await nextTick();
  await eventually(() => assert.equal(store.classroomToolsLoading, false));
  await s.saveAttendance();
  assert.deepEqual(saved.absent, ["s1"]);
  assert.equal(h.requests.filter(req => req.method === "PUT").length, 0);
  h.routes.set(`GET ${path}`, (_req, reply) => reply(saved));
  await s.loadAttendance();
  await s.saveAttendance();
  assert.deepEqual(saved.absent, ["s1"]);
  assert.equal(h.requests.filter(req => req.method === "PUT").length, 1);
});

test("a successful quick-settings save preserves later edits and leaves them dirty", async () => {
  h.api.saveAccountTokens({accessToken: "admin", refreshToken: "refresh"});
  const path = "/api/v2/admin/schools/school/homework-settings";
  h.routes.set(`GET ${path}`, (_req, reply) => reply({}));
  const m = await h.openSchoolHomeworkSettings(), s = m.state;
  await s.loadSchoolHomeworkSettings();
  const gate = deferred();
  h.routes.set(`PUT ${path}`, async (req, reply) => { await gate.promise; reply(req.body); });
  s.homeworkQuickInputs.value[0].text = "本次提交";
  const pending = s.saveSchoolHomeworkSettings();
  await eventually(() => assert.ok(h.requests.some(req => req.method === "PUT")));
  s.homeworkQuickInputs.value[0].text = "后续修改";
  gate.resolve(); await pending;
  assert.equal(s.homeworkQuickInputs.value[0].text, "后续修改");
  assert.equal(JSON.parse(s.homeworkSettingsSnapshot.value).quickInputs[0].text, "本次提交");
  assert.notEqual(s.homeworkSettingsSnapshot.value, s.homeworkSettingsValue());
});

test("a failed quick-settings save preserves later text and the previous saved snapshot", async () => {
  h.api.saveAccountTokens({accessToken: "admin", refreshToken: "refresh"});
  const path = "/api/v2/admin/schools/school/homework-settings";
  h.routes.set(`GET ${path}`, (_req, reply) => reply({}));
  const m = await h.openSchoolHomeworkSettings(), s = m.state;
  await s.loadSchoolHomeworkSettings();
  const snapshot = s.homeworkSettingsSnapshot.value;
  const gate = deferred();
  h.routes.set(`PUT ${path}`, async (_req, reply) => { await gate.promise; reply({message: "保存失败"}, 503); });
  m.successMessage.value = "上次保存成功";
  const pending = s.saveSchoolHomeworkSettings();
  await eventually(() => assert.ok(h.requests.some(req => req.method === "PUT")));
  s.homeworkQuickInputs.value[0].text = "不能丢失";
  gate.resolve(); await pending;
  assert.equal(s.homeworkQuickInputs.value[0].text, "不能丢失");
  assert.equal(s.homeworkSettingsSnapshot.value, snapshot);
  assert.equal(m.successMessage.value, "");
  assert.match(m.errorMessage.value, /保存失败/);
});

test("a pending attendance load cannot be saved or replace a newer binding's data", async () => {
  const store = h.newStore({screen: true});
  const loads = [];
  const load = store.loadClassroomTools.bind(store);
  store.loadClassroomTools = date => {
    const pending = load(date);
    loads.push(pending);
    return pending;
  };
  const gate = deferred();
  let reads = 0;
  h.routes.set("GET /api/v2/classroom-screens/students", (_req, reply) => reply([{id: "s1", name: "张三"}]));
  const {state: s, props} = await h.openComponent("/src/components/v2/ClassroomToolsDialog.vue", {modelValue: false});
  const path = `/api/v2/classroom-screens/attendance/${s.today()}`;
  h.routes.set(`GET ${path}`, async (_req, reply) => {
    const read = ++reads;
    if (read === 1) await gate.promise;
    reply({absent: read === 1 ? ["s1"] : [], late: [], excluded: []});
  });
  props.modelValue = true; await nextTick();
  await eventually(() => assert.equal(reads, 1));
  await s.saveAttendance();
  assert.equal(h.requests.filter(req => req.method === "PUT").length, 0);
  store.screenSession.binding.id = "screen-b";
  await eventually(() => assert.equal(s.attendanceReady.value, true));
  gate.resolve();
  await loads[0]; await nextTick();
  assert.deepEqual(s.attendanceDraft.value.absent, []);
  assert.deepEqual(store.classroomAttendance.absent, []);
});

test("yesterday's loaded attendance cannot be submitted as today's record", async t => {
  t.mock.timers.enable({apis: ["Date"], now: Date.now()});
  h.newStore({screen: true});
  const {state: s, props} = await h.openComponent("/src/components/v2/ClassroomToolsDialog.vue", {modelValue: false});
  h.routes.set("GET /api/v2/classroom-screens/students", (_req, reply) => reply([]));
  h.routes.set(`GET /api/v2/classroom-screens/attendance/${s.today()}`, (_req, reply) => reply({absent: [], late: [], excluded: []}));
  props.modelValue = true; await nextTick();
  await eventually(() => assert.equal(s.attendanceReady.value, true));
  t.mock.timers.setTime(Date.now() + 86400000);
  await s.saveAttendance();
  assert.equal(h.requests.filter(req => req.method === "PUT").length, 0);
});
