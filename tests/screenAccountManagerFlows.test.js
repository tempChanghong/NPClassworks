import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, eventually} from "./helpers/flowHarness.js";

let h, screens;
const base = "/api/v2/admin/schools/school";
const device = {id: "screen-a", name: "一班大屏", loginCode: "class-a", administrativeClassId: "class-a",
  administrativeClass: {name: "一班", code: "C1"}, isActive: true, dutyState: "ONLINE"};
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset();
  h.api.saveAccountTokens({accessToken: "admin-token", refreshToken: "admin-refresh"});
  screens = [{...device}];
  h.routes.set(`GET ${base}/classroom-screens`, (_req, reply) => reply(screens));
});

async function confirm(pending, accepted = true) {
  await eventually(() => assert.equal(h.dialogs.actionDialogState.open, true));
  h.dialogs.settleActionDialog(accepted);
  await pending;
}

test("screen creation preserves failed input, sends the original payload and clears only after success", async () => {
  const m = await h.openScreenAccountManager(), s = m.state;
  assert.equal(m.panelState.newScreenName, s.newScreenName, "panel edits the same refs used by the page guard");
  s.newScreenName.value = "新设备";
  s.newScreenLoginCode.value = "new-screen";
  s.newScreenPin.value = "1234";
  s.newScreenAdministrativeClassId.value = "class-a";
  assert.equal(s.hasUnsavedChanges.value, true);
  h.routes.set(`POST ${base}/classroom-screen-accounts`, (_req, reply) => reply({message: "暂时不可用"}, 503));
  await s.createScreenAccount();
  assert.equal(s.newScreenPin.value, "1234");
  assert.equal(s.newScreenName.value, "新设备");
  assert.equal(s.screenBusy.value, false);
  assert.match(m.errorMessage.value, /暂时不可用/);
  h.routes.set(`POST ${base}/classroom-screen-accounts`, (req, reply) => {
    assert.equal(req.headers.authorization, "Bearer admin-token");
    assert.deepEqual(req.body, {name: "新设备", loginCode: "new-screen", pin: "1234", administrativeClassId: "class-a"});
    screens.push({id: "new", ...req.body}); reply(req.body);
  });
  await s.createScreenAccount();
  assert.equal(s.hasUnsavedChanges.value, false);
  assert.equal(s.newScreenPin.value, "");
  assert.equal(s.screenAccounts.value.length, 2);
  assert.equal(m.errorMessage.value, "");
});

test("screen editing omits an empty PIN and keeps the dialog and draft on permission failure", async () => {
  const m = await h.openScreenAccountManager(), s = m.state;
  s.openScreenEdit(device);
  assert.equal(s.hasUnsavedChanges.value, false);
  s.screenEdit.value.name = "改名";
  assert.equal(s.hasUnsavedChanges.value, true);
  h.routes.set(`PATCH ${base}/classroom-screens/screen-a`, (_req, reply) => reply({message: "无管理权限"}, 403));
  await s.saveScreenAccount();
  assert.equal(s.screenEditDialog.value, true);
  assert.equal(s.screenEdit.value.name, "改名");
  assert.match(m.errorMessage.value, /无管理权限/);
  const inputs = [];
  h.routes.set(`PATCH ${base}/classroom-screens/screen-a`, (req, reply) => { inputs.push(req.body); reply(req.body); });
  await s.saveScreenAccount();
  assert.deepEqual(inputs[0], {name: "改名", loginCode: "class-a", administrativeClassId: "class-a"});
  assert.equal(s.screenEditDialog.value, false);
  assert.equal(s.hasUnsavedChanges.value, false);
  s.openScreenEdit(device);
  s.screenEdit.value.pin = "5678";
  await s.saveScreenAccount();
  assert.equal(inputs[1].pin, "5678");
});

test("cancelled reset, activation and commands send no writes; confirmed operations use the existing endpoints", async () => {
  const {state: s} = await h.openScreenAccountManager();
  for (const action of [() => s.resetScreenDevice(device), () => s.setScreenActive(device, false),
    () => s.issueScreenCommand(device, "RELOAD_APP")]) await confirm(action(), false);
  assert.equal(h.requests.length, 0);
  h.routes.set(`POST ${base}/classroom-screens/screen-a/reset-device`, (_req, reply) => reply({}));
  h.routes.set(`POST ${base}/classroom-screens/screen-a/commands`, (_req, reply) => reply({}));
  await confirm(s.resetScreenDevice(device));
  for (const type of ["REFRESH_DATA", "RELOAD_APP"]) await confirm(s.issueScreenCommand(device, type));
  assert.deepEqual(h.requests.filter(r => r.method === "POST").map(r => r.body), [null, {type: "REFRESH_DATA"}, {type: "RELOAD_APP"}]);
});

test("activation undo retains the original school and failures do not offer undo", async () => {
  const m = await h.openScreenAccountManager(), s = m.state;
  h.routes.set(`PATCH ${base}/classroom-screens/screen-a`, (_req, reply) => reply({message: "禁止操作"}, 403));
  await confirm(s.setScreenActive(device, false));
  assert.equal(m.undoOffers.length, 0);
  h.routes.set(`PATCH ${base}/classroom-screens/screen-a`, (_req, reply) => reply({}));
  await confirm(s.setScreenActive(device, false));
  assert.equal(m.undoOffers.length, 1);
  m.selectedSchoolId.value = "other";
  h.routes.set("GET /api/v2/admin/schools/other/classroom-screens", (_req, reply) => reply([]));
  await m.undoOffers[0].undo();
  const writes = h.requests.filter(r => r.method === "PATCH");
  assert.equal(writes.at(-1).path, `${base}/classroom-screens/screen-a`);
  assert.deepEqual(writes.at(-1).body, {isActive: true});
});

test("screen filtering and each editor remain independent; polling replacement and unmount clear timers", async () => {
  const first = await h.openScreenAccountManager(), second = await h.openScreenAccountManager();
  screens.push({...device, id: "offline", name: "离线设备", dutyState: "OFFLINE"});
  await first.state.loadScreenAccounts();
  first.state.screenSearch.value = "CLASS-A";
  first.state.screenStatusFilter.value = "OFFLINE";
  assert.deepEqual(first.state.filteredScreenAccounts.value.map(s => s.id), ["offline"]);
  assert.equal(second.state.screenSearch.value, "");
  assert.deepEqual(second.state.screenAccounts.value, []);
  const intervals = new Map();
  const originalSet = window.setInterval, originalClear = window.clearInterval;
  let id = 0;
  window.setInterval = (callback, delay) => { assert.equal(delay, 30_000); intervals.set(++id, callback); return id; };
  window.clearInterval = key => intervals.delete(key);
  try {
    first.state.startDutyPolling();
    first.state.startDutyPolling();
    assert.equal(intervals.size, 1);
    await [...intervals.values()][0]();
    first.state.stopDutyPolling();
    assert.equal(intervals.size, 0);
    first.state.startDutyPolling();
    first.unmount();
    assert.equal(intervals.size, 0);
  } finally {
    window.setInterval = originalSet; window.clearInterval = originalClear;
  }
});
