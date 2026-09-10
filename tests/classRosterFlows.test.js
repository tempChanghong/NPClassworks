import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
beforeEach(() => h.reset());
after(async () => { await h?.close(); });

test("roster load failure disables editing and a late old-school response cannot replace the current class", async () => {
  h.newStore();
  const gate = deferred();
  let fail = true;
  h.routes.set("GET /api/v2/admin/schools/a/academic-structure", async (_req, reply) => {
    await gate.promise;
    reply({grades: [{id: "ga"}], administrativeClasses: [{id: "ca", gradeId: "ga"}]});
  });
  h.routes.set("GET /api/v2/admin/schools/b/academic-structure", (_req, reply) => reply({
    grades: [{id: "gb"}], administrativeClasses: [{id: "cb", gradeId: "gb"}],
  }));
  h.routes.set("GET /api/v2/admin/schools/b/administrative-classes/cb/students", (_req, reply) =>
    fail ? reply({message: "暂时不能读取"}, 503) : reply({students: [{id: "b1", name: "乙校学生"}], revision: "b1"}));
  const {state, props} = await h.openComponent("/src/components/admin/ClassRosterManager.vue", {schoolId: "a", termId: "ta"});
  props.schoolId = "b"; props.termId = "tb";
  await nextTick();
  await eventually(() => assert.match(state.error.value, /暂时不能读取/));
  assert.equal(state.revision.value, null);
  assert.equal(state.rows.value.length, 0);
  gate.resolve();
  fail = false;
  await state.reload();
  assert.equal(state.classId.value, "cb");
  assert.equal(state.rows.value[0].name, "乙校学生");
  assert.equal(state.revision.value, "b1");
});

test("screen roster save arriving after a binding switch cannot populate the new binding", async () => {
  const store = h.newStore({screen: true});
  const gate = deferred();
  h.routes.set("PUT /api/v2/classroom-screens/students", async (_req, reply) => { await gate.promise; reply([{id: "old", name: "旧班学生"}]); });
  const saving = store.replaceClassroomStudents([{id: "old", name: "旧班学生"}], "old-version");
  store.screenSession = {binding: {id: "new-binding", credentialVersion: 1}};
  store.classroomStudents = [{id: "new", name: "新班学生"}];
  store.classroomRosterRevision = "new-version";
  gate.resolve(); await saving;
  assert.equal(store.classroomStudents[0].name, "新班学生");
  assert.equal(store.classroomRosterRevision, "new-version");
});
