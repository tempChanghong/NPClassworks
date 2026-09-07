import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness} from "./helpers/flowHarness.js";

let h;
const path = "/api/v2/admin/schools/school/homework-settings";
const savedSettings = () => ({
  quickDeadlines: [{label: "明天", dayOffset: 1, time: "07:30"}],
  quickInputs: [{label: "数学练习", text: "完成练习", group: "常用", subjectIds: ["math"], insertMode: "INLINE"}],
});
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset();
  h.api.saveAccountTokens({accessToken: "admin-token", refreshToken: "admin-refresh"});
  h.routes.set(`GET ${path}`, (_req, reply) => reply(savedSettings()));
});
async function openSettings() {
  const manager = await h.openSchoolHomeworkSettings();
  await manager.state.loadSchoolHomeworkSettings();
  return manager;
}

test("both settings panels use one loaded state and saved snapshot", async () => {
  const {state: s, inputPanel, deadlinePanel} = await openSettings();
  assert.equal(inputPanel.homeworkQuickInputs, s.homeworkQuickInputs);
  assert.equal(deadlinePanel.homeworkQuickDeadlines, s.homeworkQuickDeadlines);
  assert.equal(inputPanel.saveSchoolHomeworkSettings, deadlinePanel.saveSchoolHomeworkSettings);
  assert.deepEqual(s.homeworkQuickInputs.value, savedSettings().quickInputs);
  assert.deepEqual(s.homeworkQuickInputSubjects.value, [{id: "math", name: "数学"}]);
  assert.equal(s.homeworkSettingsSnapshot.value, s.homeworkSettingsValue());
  inputPanel.homeworkQuickInputs.value[0].text = "本地修改";
  assert.notEqual(s.homeworkSettingsSnapshot.value, s.homeworkSettingsValue());
});

test("saving sends both panels together, preserves failures and applies the server-normalized result", async () => {
  const m = await openSettings(), s = m.state;
  const snapshot = s.homeworkSettingsSnapshot.value;
  s.homeworkQuickInputs.value[0].text = " 修改内容 ";
  s.updateQuickDeadlineDateRule(s.homeworkQuickDeadlines.value[0], "next-weekday:1");
  h.routes.set(`PUT ${path}`, (_req, reply) => reply({message: "没有管理权限"}, 403));
  await s.saveSchoolHomeworkSettings();
  assert.equal(s.homeworkQuickInputs.value[0].text, " 修改内容 ");
  assert.equal(s.homeworkSettingsSnapshot.value, snapshot);
  assert.equal(s.homeworkSettingsBusy.value, false);
  assert.match(m.errorMessage.value, /没有管理权限/);
  const expected = JSON.parse(s.homeworkSettingsValue());
  h.routes.set(`PUT ${path}`, (req, reply) => {
    assert.equal(req.headers.authorization, "Bearer admin-token");
    assert.deepEqual(req.body, expected);
    reply({...req.body, quickInputs: [{...req.body.quickInputs[0], text: "修改内容"}]});
  });
  await s.saveSchoolHomeworkSettings();
  assert.equal(s.homeworkQuickInputs.value[0].text, "修改内容");
  assert.equal(s.homeworkSettingsSnapshot.value, s.homeworkSettingsValue());
  assert.equal(m.errorMessage.value, "");
  assert.match(m.successMessage.value, /已保存/);
});

test("invalid deadlines or inputs make no writes, while disabling inputs is saved as an empty array", async () => {
  const m = await openSettings(), s = m.state;
  s.homeworkQuickDeadlines.value[0].time = "25:00";
  await s.saveSchoolHomeworkSettings();
  assert.match(m.errorMessage.value, /有效快捷时间/);
  s.homeworkQuickDeadlines.value = savedSettings().quickDeadlines;
  s.homeworkQuickInputs.value[0].text = "";
  await s.saveSchoolHomeworkSettings();
  assert.match(m.errorMessage.value, /普通快捷词必须填写/);
  assert.equal(h.requests.filter(req => req.method === "PUT").length, 0);
  h.routes.set(`PUT ${path}`, (req, reply) => reply(req.body));
  s.homeworkQuickInputs.value = [];
  await s.saveSchoolHomeworkSettings();
  assert.deepEqual(h.requests.at(-1).body.quickInputs, []);
  assert.deepEqual(s.homeworkQuickInputs.value, []);
  assert.equal(s.homeworkSettingsSnapshot.value, s.homeworkSettingsValue());
});

test("failed reload preserves known settings and an empty school resets only this manager", async () => {
  const first = await openSettings(), second = await openSettings();
  first.state.homeworkQuickInputs.value[0].text = "保留草稿";
  const snapshot = first.state.homeworkSettingsSnapshot.value;
  h.routes.set(`GET ${path}`, (_req, reply) => reply({message: "暂时不可用"}, 503));
  await first.state.loadSchoolHomeworkSettings();
  assert.equal(first.state.homeworkQuickInputs.value[0].text, "保留草稿");
  assert.equal(first.state.homeworkSettingsSnapshot.value, snapshot);
  assert.match(first.errorMessage.value, /暂时不可用/);
  assert.equal(second.state.homeworkQuickInputs.value[0].text, "完成练习");
  first.selectedSchoolId.value = "";
  const count = h.requests.length;
  await first.state.loadSchoolHomeworkSettings();
  assert.equal(h.requests.length, count);
  assert.deepEqual(first.state.homeworkQuickInputSubjects.value, []);
  assert.equal(first.state.homeworkSettingsSnapshot.value, first.state.homeworkSettingsValue());
  assert.equal(second.state.homeworkQuickInputs.value[0].text, "完成练习");
});

test("deadline rules, add limits and reset preserve existing editor behavior", async () => {
  const {state: s} = await openSettings();
  const preset = s.homeworkQuickDeadlines.value[0];
  s.updateQuickDeadlineDateRule(preset, "next-weekday:0");
  assert.equal(s.quickDeadlineDateValue(preset), "next-weekday:0");
  assert.equal(Object.hasOwn(preset, "dayOffset"), false);
  s.updateQuickDeadlineDateRule(preset, "relative:2");
  assert.equal(s.quickDeadlineDateValue(preset), "relative:2");
  assert.equal(Object.hasOwn(preset, "weekday"), false);
  for (let i = 0; i < 70; i++) { s.addHomeworkQuickDeadline(); s.addHomeworkQuickInput(); }
  assert.equal(s.homeworkQuickDeadlines.value.length, 8);
  assert.equal(s.homeworkQuickInputs.value.length, 64);
  s.resetHomeworkQuickDeadlines(); s.resetHomeworkQuickInputs();
  assert.equal(s.homeworkQuickDeadlines.value.length, 5);
  assert.equal(s.homeworkQuickInputs.value.length, 12);
  assert.notEqual(s.homeworkSettingsSnapshot.value, s.homeworkSettingsValue(), "reset is a draft until saved");
});
