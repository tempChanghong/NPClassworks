import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, eventually} from "./helpers/flowHarness.js";

let h;
let profile;
let structure;
const base = "/api/v2/admin/schools/school";
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset();
  h.api.saveAccountTokens({accessToken: "admin-token", refreshToken: "admin-refresh"});
  profile = {id: "school", name: "测试学校", teacherAuthMode: "LOCAL_PIN", allowOAuthTeacherLogin: false, updatedAt: "v1"};
  structure = {
    grades: [{id: "grade", name: "高一", code: "G1"}],
    subjects: [{id: "math", name: "数学", code: "MATH", category: "CORE"}],
    administrativeClasses: [{id: "class-a", gradeId: "grade", name: "一班", code: "C1", isActive: true,
      isStudentSelectable: true, updatedAt: "v1", subjectRules: [{subjectId: "math", deliveryMode: "ADMIN_CLASS"}]}],
    courseGroups: [],
  };
  h.routes.set(`GET ${base}/academic-structure`, (_req, reply) => reply(structure));
  h.routes.set(`GET ${base}/profile`, (_req, reply) => reply(profile));
  h.routes.set(`PATCH ${base}/profile`, (req, reply) => {
    const {expectedUpdatedAt, ...input} = req.body;
    if (expectedUpdatedAt !== profile.updatedAt) return reply({code: "ORGANIZATION_VERSION_CONFLICT"}, 409);
    profile = {...profile, ...input, updatedAt: "v3"};
    reply(profile);
  });
});

async function openManager() {
  const manager = await h.openAcademicManager();
  await eventually(() => {
    assert.equal(manager.state.loading.value, false);
    assert.equal(manager.state.schoolProfile.value?.id, "school");
  });
  return manager;
}

test("academic manager keeps reactive school/term inputs and class rules after extraction", async () => {
  const {state, props, unmount} = await openManager();
  assert.equal(state.selectedClassId.value, "class-a");
  assert.deepEqual(state.ruleModes.value, {math: "ADMIN_CLASS"});
  h.routes.set("GET /api/v2/admin/schools/other/academic-structure", (req, reply) => {
    assert.equal(req.query.get("termId"), "next-term");
    reply({...structure, administrativeClasses: [{...structure.administrativeClasses[0], id: "class-b",
      subjectRules: [{subjectId: "math", deliveryMode: "COURSE_GROUP"}]}]});
  });
  h.routes.set("GET /api/v2/admin/schools/other/profile", (_req, reply) => reply({...profile, id: "other", name: "另一所学校"}));
  Object.assign(props, {schoolId: "other", termId: "next-term"});
  await eventually(() => assert.equal(state.schoolForm.value.name, "另一所学校"));
  assert.equal(state.selectedClassId.value, "class-b");
  assert.deepEqual(state.ruleModes.value, {math: "COURSE_GROUP"});
  unmount();
  const count = h.requests.length;
  props.termId = "after-unmount";
  await nextTick();
  assert.equal(h.requests.length, count, "unmounted component must stop watching props");
});

test("academic manager saves with the loaded version and clears the password only after success", async () => {
  const {state} = await openManager();
  state.schoolForm.value.name = "新校名";
  state.schoolForm.value.sharedPassword = "test-password";
  await state.saveSchoolProfile();
  const request = h.requests.find(req => req.method === "PATCH");
  assert.equal(request.headers.authorization, "Bearer admin-token");
  assert.equal(request.body.expectedUpdatedAt, "v1");
  assert.equal(request.body.sharedPassword, "test-password");
  assert.equal(profile.name, "新校名");
  assert.equal(state.schoolProfile.value.updatedAt, "v3");
  assert.equal(state.schoolForm.value.sharedPassword, "");
  assert.equal(state.errorMessage.value, "");
  assert.match(state.successMessage.value, /已保存/);
});

test("academic manager preserves local input on request failure and isolates each mounted editor", async () => {
  const first = await openManager();
  const second = await openManager();
  first.state.schoolForm.value.name = "尚未保存";
  first.state.schoolForm.value.sharedPassword = "retained-password";
  h.routes.set(`PATCH ${base}/profile`, (_req, reply) => reply({message: "暂时不可用"}, 503));
  await first.state.saveSchoolProfile();
  assert.equal(first.state.schoolForm.value.name, "尚未保存");
  assert.equal(first.state.schoolForm.value.sharedPassword, "retained-password");
  assert.equal(first.state.loading.value, false);
  assert.match(first.state.errorMessage.value, /暂时不可用/);
  assert.equal(first.state.successMessage.value, "");
  assert.equal(second.state.schoolForm.value.name, "测试学校");
  assert.equal(second.state.errorMessage.value, "");
});

test("academic manager restores a conflicting local draft and retries against the latest version", async () => {
  const {state} = await openManager();
  state.schoolForm.value.name = "本地校名";
  profile = {...profile, name: "他人已修改", updatedAt: "v2"};
  await state.saveSchoolProfile();
  assert.equal(state.conflictDialog.value, true);
  assert.equal(state.organizationConflict.value.local.name, "本地校名");
  assert.equal(state.organizationConflict.value.current.name, "他人已修改");
  assert.equal(profile.name, "他人已修改");
  state.keepOrganizationLocalDraft();
  assert.equal(state.schoolForm.value.name, "本地校名");
  assert.equal(state.conflictDialog.value, false);
  await state.saveSchoolProfile();
  assert.deepEqual(h.requests.filter(req => req.method === "PATCH").map(req => req.body.expectedUpdatedAt), ["v1", "v2"]);
  assert.equal(profile.name, "本地校名");
});

test("academic manager can accept the server version without writing the conflicting draft", async () => {
  const {state} = await openManager();
  state.schoolForm.value.name = "未采用的校名";
  profile = {...profile, name: "保留服务器", updatedAt: "v2"};
  await state.saveSchoolProfile();
  state.acceptOrganizationServerVersion();
  assert.equal(state.conflictDialog.value, false);
  assert.equal(state.organizationConflict.value, null);
  assert.equal(state.schoolForm.value.name, "保留服务器");
  assert.equal(h.requests.filter(req => req.method === "PATCH").length, 1);
});

test("class deactivation requires impact confirmation, supports undo, and cleans up on unmount", async () => {
  h.routes.set(`GET ${base}/workspaces/class-a/change-impact`, (_req, reply) => reply({requiresConfirmation: true}));
  h.routes.set(`PATCH ${base}/administrative-classes/class-a`, (req, reply) => {
    const current = structure.administrativeClasses[0];
    assert.equal(req.body.expectedUpdatedAt, current.updatedAt);
    Object.assign(current, req.body, {updatedAt: req.body.isActive ? "v3" : "v2"});
    reply(current);
  });
  const {state, unmount} = await openManager();
  const deactivate = async () => {
    state.openAdministrativeClassDialog("grade", state.structure.value.administrativeClasses[0]);
    state.administrativeClassForm.value.isActive = false;
    await state.saveAdministrativeClass();
  };
  await deactivate();
  assert.equal(state.impactDialog.value, true);
  assert.equal(h.requests.some(req => req.method === "PATCH"), false);
  await state.confirmImpactChange();
  assert.equal(h.requests.find(req => req.method === "PATCH").body.confirmImpact, true);
  assert.equal(structure.administrativeClasses[0].isActive, false);
  assert.equal(state.impactDialog.value, false);
  assert.ok(state.undoOffer.value);
  assert.ok(state.remainingSeconds.value > 0);
  await state.undoLastDeactivation();
  assert.equal(structure.administrativeClasses[0].isActive, true);
  assert.equal(state.undoOffer.value, null);
  await deactivate();
  await state.confirmImpactChange();
  assert.ok(state.undoOffer.value);
  unmount();
  assert.equal(state.undoOffer.value, null);
  assert.equal(state.remainingSeconds.value, 0);
});
