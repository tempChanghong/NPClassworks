import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());
const clone = value => JSON.parse(JSON.stringify(value));
const catalog = id => ({schoolId: id, term: {id: `term-${id}`, schoolId: id}, grades: [],
  administrativeClasses: [{id: `class-${id}`, name: `${id}班`, type: "ADMIN_CLASS"}], subjects: [{id: `subject-${id}`} ]});
const options = id => ({administrativeClass: {id: `class-${id}`, name: `${id}班`}, subjects: []});
async function selector() {
  const store = h.newStore();
  const a = catalog("a");
  Object.assign(store, {schools: [{id: "a", name: "A校"}, {id: "b", name: "B校"}],
    selection: {schoolId: "a", administrativeClassId: "class-a", courseGroupIds: {}, declinedSubjectIds: []},
    term: a.term, grades: a.grades, administrativeClasses: a.administrativeClasses, studentSubjects: a.subjects,
    courseOptions: options("a"), feed: [{id: "a-homework"}], selectionDialog: true});
  localStorage.setItem("classworks-v2-student-selection", JSON.stringify(store.selection));
  h.routes.set("GET /api/v2/catalog/terms/current", (req, reply) => reply(catalog(req.query.get("schoolId")).term));
  h.routes.set("GET /api/v2/catalog/grades", (_req, reply) => reply([]));
  h.routes.set("GET /api/v2/catalog/workspaces", (req, reply) => reply(catalog(req.query.get("termId").slice(5)).administrativeClasses));
  h.routes.set("GET /api/v2/catalog/subjects", (req, reply) => reply(catalog(req.query.get("schoolId")).subjects));
  for (const id of ["a", "b"]) {
    h.routes.set(`GET /api/v2/catalog/administrative-classes/class-${id}/course-options`, (_req, reply) => reply(options(id)));
    h.routes.set(`POST /api/v2/catalog/administrative-classes/class-${id}/student-selection/validate`, (req, reply) => reply({normalized: req.body, confirmedAt: "now", issues: []}));
  }
  const component = await h.openComponent("/src/components/v2/ClassSelectionDialog.vue", {modelValue: true});
  await nextTick();
  return {store, ...component};
}
const board = store => clone({selection: store.selection, term: store.term, classes: store.administrativeClasses,
  subjects: store.studentSubjects, options: store.courseOptions, feed: store.feed});

test("cross-school draft and cancel preserve the active board, catalog and saved selection", async () => {
  const {store, state: s, props} = await selector();
  const original = board(store), persisted = localStorage.getItem("classworks-v2-student-selection");
  await s.handleSchoolChange("b");
  await s.handleAdministrativeClassChange("class-b");
  assert.equal(s.catalog.value.schoolId, "b");
  assert.deepEqual(board(store), original);
  props.modelValue = false; await nextTick();
  assert.deepEqual(board(store), original);
  assert.equal(localStorage.getItem("classworks-v2-student-selection"), persisted);
  props.modelValue = true; await nextTick();
  assert.equal(s.schoolId.value, "a");
  assert.equal(s.courseOptions.value.administrativeClass.id, "class-a");
});

for (const outcome of ["success", "failure"]) {
  test(`closing while a cross-school catalog ${outcome} is pending ignores its late result`, async () => {
    const {store, state: s, props} = await selector();
    const original = board(store), started = deferred(), release = deferred();
    h.routes.set("GET /api/v2/catalog/terms/current", async (_req, reply) => {
      started.resolve(); await release.promise;
      reply(outcome === "success" ? catalog("b").term : {message: "B failed"}, outcome === "success" ? 200 : 503);
    });
    const loading = s.handleSchoolChange("b"); await started.promise;
    props.modelValue = false; props.modelValue = true;
    release.resolve(); await loading; await nextTick();
    assert.equal(s.schoolId.value, "a");
    assert.equal(s.error.value, "");
    assert.deepEqual(board(store), original);
  });
}

test("cross-school validation commits its own catalog only after success", async () => {
  const {store, state: s} = await selector();
  await s.handleSchoolChange("b"); await s.handleAdministrativeClassChange("class-b");
  await s.commit();
  assert.equal(store.selection.schoolId, "b");
  assert.equal(store.selection.termId, "term-b");
  assert.equal(store.courseOptions.administrativeClass.id, "class-b");
  assert.equal(store.studentSubjects[0].id, "subject-b");
  assert.equal(JSON.parse(localStorage.getItem("classworks-v2-student-selection")).administrativeClassId, "class-b");
});

test("closing while validation is pending cannot commit an abandoned draft", async () => {
  const {store, state: s, props} = await selector();
  const original = board(store), started = deferred(), release = deferred();
  await s.handleSchoolChange("b"); await s.handleAdministrativeClassChange("class-b");
  h.routes.set("POST /api/v2/catalog/administrative-classes/class-b/student-selection/validate", async (req, reply) => {
    started.resolve(); await release.promise; reply({normalized: req.body, confirmedAt: "now", issues: []});
  });
  const saving = s.commit(); await started.promise;
  props.modelValue = false; release.resolve(); await saving;
  assert.deepEqual(board(store), original);
});

test("rejected cross-school choices refresh only the draft and retain the active board", async () => {
  const {store, state: s} = await selector();
  const original = board(store);
  await s.handleSchoolChange("b"); await s.handleAdministrativeClassChange("class-b");
  const refreshed = {...options("b"), subjects: [{subject: {id: "physics"}, requiresCourseGroupSelection: true,
    isCompulsory: true, courseGroups: [{id: "new-b-group", name: "新走班"}]}]};
  h.routes.set("GET /api/v2/catalog/administrative-classes/class-b/course-options", (_req, reply) => reply(refreshed));
  h.routes.set("POST /api/v2/catalog/administrative-classes/class-b/student-selection/validate", (_req, reply) => reply({
    code: "STUDENT_SELECTION_INVALID", message: "B校走班已调整", data: {issues: [{subjectId: "physics", severity: "ERROR", message: "请重新选择"}]},
  }, 422));
  await s.commit(); await nextTick();
  assert.deepEqual(board(store), original);
  assert.match(s.error.value, /B校走班已调整/);
  assert.equal(s.streamedSubjects.value[0].courseGroups[0].id, "new-b-group");
  assert.equal(s.selectionComplete.value, false);
});

const settings = label => ({quickDeadlines: [{label, dayOffset: 1, time: "07:30"}], quickInputs: []});
for (const first of ["a", "b"]) {
  test(`settings responses arriving ${first} first cannot cross schools or release another load`, async () => {
    const gates = {a: deferred(), b: deferred()};
    for (const id of ["a", "b"]) h.routes.set(`GET /api/v2/admin/schools/${id}/homework-settings`, async (_req, reply) => {
      await gates[id].promise; reply(settings(id));
    });
    const m = await h.openSchoolHomeworkSettings(), s = m.state;
    m.selectedSchoolId.value = "a"; const a = s.loadSchoolHomeworkSettings();
    m.selectedSchoolId.value = "b"; const b = s.loadSchoolHomeworkSettings();
    gates[first].resolve(); await (first === "a" ? a : b);
    assert.equal(s.homeworkSettingsBusy.value, first === "a");
    assert.equal(s.homeworkSettingsReady.value, first === "b");
    gates[first === "a" ? "b" : "a"].resolve(); await Promise.all([a, b]);
    assert.equal(s.homeworkQuickDeadlines.value[0].label, "b");
    let written;
    h.routes.set("PUT /api/v2/admin/schools/b/homework-settings", (req, reply) => { written = req.body; reply(req.body); });
    await s.saveSchoolHomeworkSettings();
    assert.equal(written.quickDeadlines[0].label, "b");
  });
}

test("failed school load disables saving the previous school's data and a retry restores editing", async () => {
  const m = await h.openSchoolHomeworkSettings(), s = m.state;
  h.routes.set("GET /api/v2/admin/schools/school/homework-settings", (_req, reply) => reply(settings("A")));
  await s.loadSchoolHomeworkSettings();
  m.selectedSchoolId.value = "b";
  await s.saveSchoolHomeworkSettings();
  h.routes.set("GET /api/v2/admin/schools/b/homework-settings", (_req, reply) => reply({message: "B failed"}, 503));
  await s.loadSchoolHomeworkSettings(); await s.saveSchoolHomeworkSettings();
  assert.equal(s.homeworkSettingsReady.value, false);
  assert.equal(h.requests.filter(req => req.method === "PUT").length, 0);
  h.routes.set("GET /api/v2/admin/schools/b/homework-settings", (_req, reply) => reply(settings("B")));
  await s.loadSchoolHomeworkSettings();
  assert.equal(s.homeworkSettingsReady.value, true);
  assert.equal(s.homeworkQuickDeadlines.value[0].label, "B");
});

test("a stale save through A to B to A cannot overwrite a reloaded form or its busy state", async () => {
  const m = await h.openSchoolHomeworkSettings(), s = m.state;
  h.routes.set("GET /api/v2/admin/schools/school/homework-settings", (_req, reply) => reply(settings("A")));
  await s.loadSchoolHomeworkSettings();
  const started = deferred(), release = deferred(), loadGate = deferred();
  h.routes.set("PUT /api/v2/admin/schools/school/homework-settings", async (req, reply) => {
    started.resolve(); await release.promise; reply(req.body);
  });
  const saving = s.saveSchoolHomeworkSettings(); await started.promise;
  m.selectedSchoolId.value = "b"; m.selectedSchoolId.value = "school";
  h.routes.set("GET /api/v2/admin/schools/school/homework-settings", async (_req, reply) => {
    await loadGate.promise; reply(settings("A-new"));
  });
  const loading = s.loadSchoolHomeworkSettings(); release.resolve(); await saving;
  assert.equal(s.homeworkSettingsBusy.value, true);
  loadGate.resolve(); await loading;
  assert.equal(s.homeworkQuickDeadlines.value[0].label, "A-new");
  assert.equal(m.successMessage.value, "");
});
