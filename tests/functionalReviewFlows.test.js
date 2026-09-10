import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

async function composer() {
  const store = h.newStore();
  store.eligibleTeacherWorkspaces = () => [h.workspace];
  const {state} = await h.openComponent("/src/components/v2/PublicationComposer.vue", {editingPublication: null});
  Object.assign(state.form, {subjectId: "math", targetWorkspaceIds: ["class-a"], title: "保留标题", content: "保留正文"});
  await nextTick();
  return {store, state};
}

for (const status of ["DRAFT", "PUBLISHED"]) {
  test(`${status}: invalid publication times are explained and corrected input can be submitted`, async () => {
    const {store, state} = await composer();
    const writes = [];
    store.publish = async input => { writes.push(input); return {id: "new", ...input}; };
    store.teacherError = "之前的无关错误";
    for (const time of ["", "not-a-date"]) {
      state.form.publishAt = time;
      await state.submit(status);
      assert.equal(writes.length, 0);
      assert.equal(state.localError.value, "请填写有效的发布时间");
      assert.equal(state.form.content, "保留正文");
      assert.equal(state.form.title, "保留标题");
      assert.deepEqual(state.form.targetWorkspaceIds, ["class-a"]);
      assert.equal(state.saving.value || state.publishing.value, false);
    }
    state.form.publishAt = "2026-09-09T08:30";
    await state.submit(status);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, status);
    assert.equal(writes[0].publishAt, new Date("2026-09-09T08:30").toISOString());
    assert.equal(state.localError.value, "");
  });
}

test("local submission failures show their own error instead of stale store state", async () => {
  const {store, state} = await composer();
  store.teacherError = "之前的无关错误";
  store.publish = () => { throw new Error("本次提交失败"); };
  await state.submit("PUBLISHED");
  assert.equal(state.localError.value, "本次提交失败");
  assert.equal(state.form.content, "保留正文");
  store.publish = () => { throw {}; };
  await state.submit("DRAFT");
  assert.equal(state.localError.value, "保存发布内容失败，请稍后重试");
});

test("invalid optional dates are rejected before constructing the publication request", async () => {
  const {store, state} = await composer();
  let writes = 0;
  store.publish = () => { writes++; };
  state.form.dueAt = "invalid";
  await state.submit("PUBLISHED");
  assert.equal(state.localError.value, "请填写有效的截止时间，或留空");
  state.form.type = "NOTICE";
  await nextTick();
  state.form.expiresAt = "invalid";
  await state.submit("DRAFT");
  assert.equal(state.localError.value, "请填写有效的自动失效时间，或留空");
  assert.equal(writes, 0);
});

for (const status of ["absent", "late", "excluded"]) {
  test(`${status}: reopening after student removal filters only the editable attendance and permits saving`, async () => {
    const store = h.newStore({screen: true});
    let students = [{id: "s1", name: "张三", sortOrder: 0}, {id: "s2", name: "李四", sortOrder: 1}];
    let saved = {absent: [], late: [], excluded: []};
    h.routes.set("GET /api/v2/classroom-screens/students", (_req, reply) => reply(students));
    h.routes.set("PUT /api/v2/classroom-screens/students", (req, reply) => {
      students = req.body.students;
      reply(students);
    });
    const tools = await h.openComponent("/src/components/v2/ClassroomToolsDialog.vue", {modelValue: false});
    const path = `/api/v2/classroom-screens/attendance/${tools.state.today()}`;
    h.routes.set(`GET ${path}`, (_req, reply) => reply(saved));
    h.routes.set(`PUT ${path}`, (req, reply) => {
      const active = new Set(students.map(student => student.id));
      if (Object.values(req.body).flat().some(id => !active.has(id))) {
        return reply({code: "ATTENDANCE_STUDENT_INVALID", message: "无效学生"}, 422);
      }
      saved = req.body;
      reply(saved);
    });
    async function open() {
      tools.props.modelValue = true;
      await nextTick();
      await eventually(() => assert.equal(store.classroomToolsLoading, false));
    }
    await open();
    tools.state.setStudentStatus("s1", status);
    await tools.state.saveAttendance();
    assert.deepEqual(saved[status], ["s1"]);
    tools.state.openRosterEditor();
    tools.state.rosterRows.value = tools.state.rosterRows.value.filter(s => s.id === "s2");
    const savingRoster = tools.state.saveRoster();
    h.dialogs.settleActionDialog(true);
    await savingRoster;
    assert.deepEqual(saved[status], ["s1"], "saving the roster must not rewrite attendance records");
    tools.props.modelValue = false;
    await nextTick();
    await open();
    assert.deepEqual(tools.state.attendanceCounts.value, {present: 1, absent: 0, late: 0, excluded: 0});
    assert.deepEqual(store.classroomAttendance[status], ["s1"], "loaded server data remains intact");
    await tools.state.saveAttendance();
    assert.equal(store.classroomToolsError, "");
    assert.deepEqual(saved, {absent: [], late: [], excluded: []});
  });
}
