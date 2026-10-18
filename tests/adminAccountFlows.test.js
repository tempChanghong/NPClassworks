import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
const base = "/api/v2/admin/schools/school";
const account = {id: "other", name: "教师甲", username: "teacher-a", disabled: false, workspaces: []};
const membership = role => ({role, school: {id: "school", name: "测试学校", terms: [{id: "term", status: "ACTIVE"}]}});
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset();
  h.api.saveAccountTokens({accessToken: "admin-token", refreshToken: "admin-refresh"});
  for (const [path, data] of [
    ["/accounts/local/status", {bootstrapRequired: false}], ["/api/v2/catalog/schools", [{id: "school", code: "TEST"}]],
    ["/api/v2/me/schools", [membership("OWNER")]], [`${base}/local-accounts`, [account]],
    [`${base}/workspace-memberships`, {workspaces: []}], [`${base}/classroom-screens`, []],
    [`${base}/homework-settings`, {}],
  ]) h.routes.set(`GET ${path}`, (_req, reply) => reply(data));
});
async function open() {
  const m = await h.openAdminAccounts();
  await eventually(() => {
    assert.equal(m.state.localAccounts.value.length, 1);
    assert.equal(m.state.rosterBusy.value, false);
    assert.equal(m.state.adminMembershipsStatus.value, "loaded");
  });
  return m;
}
async function settle(pending, accepted, pin) {
  await eventually(() => assert.equal(h.dialogs.actionDialogState.open, true));
  if (pin !== undefined) h.dialogs.actionDialogState.value = pin;
  h.dialogs.settleActionDialog(accepted);
  await pending;
}
const writes = () => h.requests.filter(req => req.method !== "GET");

test("administrator creation preserves failed drafts and only generates credentials on success", async () => {
  const {state: s} = await open();
  Object.assign(s.recentCredentials, {value: [{username: "previous"}]});
  s.newAdminUsername.value = "new-admin"; s.newAdminName.value = "新管理员"; s.newAdminPin.value = "1234";
  assert.equal(s.currentSectionHasUnsavedChanges.value, true);
  h.routes.set(`POST ${base}/local-admins`, (_req, reply) => reply({message: "无权限"}, 403));
  await s.createAdministrator();
  assert.equal(s.newAdminPin.value, "1234");
  assert.deepEqual(s.recentCredentials.value, [{username: "previous"}]);
  assert.equal(s.accountBusy.value, false);
  h.routes.set(`POST ${base}/local-admins`, (req, reply) => {
    assert.equal(req.headers.authorization, "Bearer admin-token");
    assert.deepEqual(req.body, {username: "new-admin", name: "新管理员", pin: "1234", role: "ADMIN"}); reply({});
  });
  h.requests.length = 0;
  await s.createAdministrator();
  assert.equal(s.newAdminPin.value, "");
  assert.equal(s.currentSectionHasUnsavedChanges.value, false);
  assert.deepEqual(s.recentCredentials.value, [{school: "测试学校", name: "新管理员", username: "new-admin", pin: "1234", workspaces: "管理员"}]);
  for (const path of ["/accounts/profile", "/api/v2/me/schools", `${base}/local-accounts`])
    assert.ok(h.requests.some(req => req.path === path), `refresh ${path}`);
});

test("cancelled PIN reset, disable and deactivation send no writes; a failed PIN reset retains credentials", async () => {
  const {state: s} = await open();
  for (const action of [() => s.resetAccountPin(account), () => s.setAccountDisabled(account, true), () => s.deactivateAccount(account)])
    await settle(action(), false);
  assert.equal(writes().length, 0);
  s.recentCredentials.value = [{username: "previous"}];
  h.routes.set(`PATCH ${base}/local-accounts/other`, (_req, reply) => reply({message: "禁止修改"}, 403));
  await settle(s.resetAccountPin(account), true, "5678");
  assert.deepEqual(s.recentCredentials.value, [{username: "previous"}]);
  h.routes.set(`PATCH ${base}/local-accounts/other`, (req, reply) => { assert.deepEqual(req.body, {pin: "5678"}); reply({}); });
  await settle(s.resetAccountPin(account), true, "5678");
  assert.equal(s.recentCredentials.value[0].pin, "5678");
  assert.equal(s.recentCredentials.value[0].workspaces, "PIN 已重置");
});

test("disable undo retains the original school; failed writes offer no undo", async () => {
  const {state: s} = await open();
  h.routes.set(`PATCH ${base}/local-accounts/other`, (_req, reply) => reply({message: "禁止修改"}, 403));
  await settle(s.setAccountDisabled(account, true), true);
  assert.equal(s.undoOffer.value, null);
  h.routes.set(`PATCH ${base}/local-accounts/other`, (_req, reply) => reply({}));
  await settle(s.setAccountDisabled(account, true), true);
  assert.ok(s.undoOffer.value);
  // The shared undo callback must keep the original school even if context later changes.
  s.schoolMemberships.value = [membership("OWNER"), {role: "ADMIN", school: {id: "other-school", terms: []}}];
  for (const [suffix, data] of [["local-accounts", []], ["classroom-screens", []], ["homework-settings", {}]])
    h.routes.set(`GET /api/v2/admin/schools/other-school/${suffix}`, (_req, reply) => reply(data));
  s.selectedSchoolId.value = "other-school";
  await nextTick();
  await s.undoAdminOperation();
  assert.equal(writes().at(-1).path, `${base}/local-accounts/other`);
  assert.deepEqual(writes().at(-1).body, {disabled: false});
});

test("deactivation refreshes memberships, local accounts and roster only after a successful write", async () => {
  const {state: s} = await open();
  h.routes.set(`DELETE ${base}/local-accounts/other`, (_req, reply) => reply({message: "不能注销"}, 403));
  h.requests.length = 0;
  await settle(s.deactivateAccount(account), true);
  assert.match(s.errorMessage.value, /不能注销/);
  assert.equal(h.requests.filter(req => req.method === "GET").length, 0);
  h.routes.set(`DELETE ${base}/local-accounts/other`, (_req, reply) => reply({}));
  h.requests.length = 0;
  await settle(s.deactivateAccount(account), true);
  for (const path of ["/accounts/profile", "/api/v2/me/schools", `${base}/local-accounts`, `${base}/workspace-memberships`])
    assert.ok(h.requests.some(req => req.path === path), `refresh ${path}`);
});

test("role options remain reactive, account filters combine, and page instances keep separate drafts", async () => {
  const first = await open(), second = await open(), s = first.state;
  assert.deepEqual(s.adminRoleOptions.value.map(option => option.value), ["ADMIN", "OWNER"]);
  s.newAdminRole.value = "OWNER";
  s.schoolMemberships.value = [membership("ADMIN")];
  await nextTick();
  assert.deepEqual(s.adminRoleOptions.value.map(option => option.value), ["ADMIN"]);
  assert.equal(s.newAdminRole.value, "ADMIN");
  s.localAccounts.value = [account, {...account, id: "disabled", schoolRole: "ADMIN", disabled: true}];
  s.accountSearch.value = "TEACHER-A"; s.accountStatusFilter.value = "DISABLED";
  assert.deepEqual(s.filteredLocalAccounts.value.map(item => item.id), ["disabled"]);
  s.newAdminPin.value = "1234";
  assert.equal(second.state.newAdminPin.value, "");
  assert.equal(second.state.accountSearch.value, "");
  first.unmount();
  s.newAdminRole.value = "OWNER";
  s.schoolMemberships.value = [membership("OWNER")];
  await nextTick();
  s.schoolMemberships.value = [membership("ADMIN")];
  await nextTick();
  assert.equal(s.newAdminRole.value, "OWNER", "unmount stops the role watcher");
});

for (const outcome of ["success", "failure"]) {
  test(`an old school's late ${outcome} cannot replace the current account list or release its load`, async () => {
    const {state: s} = await open();
    const oldStarted = deferred(), oldRelease = deferred(), nextStarted = deferred(), nextRelease = deferred();
    h.routes.set(`GET ${base}/local-accounts`, async (_req, reply) => {
      oldStarted.resolve(); await oldRelease.promise;
      reply(outcome === "success" ? [account] : {message: "旧学校查询失败"}, outcome === "success" ? 200 : 503);
    });
    const nextAccount = {...account, id: "next-account", name: "另一所学校的教师"};
    for (const [suffix, data] of [["classroom-screens", []], ["homework-settings", {}]])
      h.routes.set(`GET /api/v2/admin/schools/other-school/${suffix}`, (_req, reply) => reply(data));
    h.routes.set("GET /api/v2/admin/schools/other-school/local-accounts", async (_req, reply) => {
      nextStarted.resolve(); await nextRelease.promise; reply([nextAccount]);
    });
    s.schoolMemberships.value = [membership("OWNER"), {role: "ADMIN", school: {id: "other-school", terms: []}}];
    const oldLoad = s.loadLocalAccounts(); await oldStarted.promise;
    s.selectedSchoolId.value = "other-school";
    try {
      await nextStarted.promise;
      oldRelease.resolve(); await oldLoad;
      assert.deepEqual(s.localAccounts.value, [], "old-school accounts must be withdrawn while the next school loads");
      assert.equal(s.accountBusy.value, true, "old query must not release the new query's loading state");
      assert.doesNotMatch(s.errorMessage.value, /旧学校查询失败/);
    } finally { oldRelease.resolve(); nextRelease.resolve(); }
    await eventually(() => {
      assert.deepEqual(s.localAccounts.value, [nextAccount]);
      assert.equal(s.accountBusy.value, false);
    });
  });
}

test("overlapping account refreshes keep the latest snapshot even when the older request completes last", async () => {
  const {state: s} = await open();
  const started = deferred(), release = deferred();
  h.routes.set(`GET ${base}/local-accounts`, async (_req, reply) => {
    started.resolve(); await release.promise; reply([account]);
  });
  const oldLoad = s.loadLocalAccounts(); await started.promise;
  const updated = {...account, disabled: true};
  h.routes.set(`GET ${base}/local-accounts`, (_req, reply) => reply([updated]));
  try { await s.loadLocalAccounts(); }
  finally { release.resolve(); }
  await oldLoad;
  assert.deepEqual(s.localAccounts.value, [updated]);
  assert.equal(s.accountBusy.value, false);
});

for (const outcome of ["success", "failure"]) {
  test(`closing the account page ignores a late ${outcome} from its pending refresh`, async () => {
    const {state: s, unmount} = await open();
    const started = deferred(), release = deferred();
    h.routes.set(`GET ${base}/local-accounts`, async (_req, reply) => {
      started.resolve(); await release.promise;
      reply(outcome === "success" ? [{...account, name: "关闭后的返回"}] : {message: "关闭后的错误"}, outcome === "success" ? 200 : 503);
    });
    const loading = s.loadLocalAccounts(); await started.promise;
    unmount(); release.resolve(); await loading;
    assert.deepEqual(s.localAccounts.value, [account]);
    assert.doesNotMatch(s.errorMessage.value, /关闭后的错误/);
  });
}

test("an account list refresh cannot release the busy state of pending administrator creation", async () => {
  const {state: s} = await open();
  const started = deferred(), release = deferred();
  h.routes.set(`POST ${base}/local-admins`, async (_req, reply) => {
    started.resolve(); await release.promise; reply({});
  });
  s.newAdminUsername.value = "new-admin"; s.newAdminName.value = "新管理员"; s.newAdminPin.value = "1234";
  const creation = s.createAdministrator(); await started.promise;
  try {
    await s.loadLocalAccounts();
    assert.equal(s.accountBusy.value, true);
  } finally { release.resolve(); await creation; }
  assert.equal(s.accountBusy.value, false);
});
