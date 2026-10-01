import {before, beforeEach, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtimeBlockedReason, runtimeCreateBody, runtimeEvidence, runtimeStepName} from '../src/utils/npepRuntimePresentation.js';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';

const ready = () => ({policy: {enabled: true, supported: true, pairedExamControl: true, remoteDailyControl: true, consentId: randomUUID(), policyRevision: 3},
  connectivity: 'ONLINE', receivedAt: new Date().toISOString(), sampleAsOf: new Date().toISOString(), controlEpoch: randomUUID(), unresolvedOperationId: null,
  status: {runtimeRevision: 4, modeRevision: 5, configurationRevision: 6, recording: 'IDLE', desktop: 'INTERACTIVE', noticeOpen: false, remoteExamPause: false, runtimePhase: 'IDLE'}});
test('runtime receipt distinguishes new startup changes from legacy history and uncertainty', () => {
  assert.match(runtimeEvidence({startup: 'EXAM_MODE_APPLIED'}).at(-1), /ClassIsland 已关闭，ExamAware2 已开启/);
  assert.match(runtimeEvidence({startup: 'NOT_REQUESTED'}).at(-1), /未请求修改/);
  assert.match(runtimeEvidence({startup: 'UNKNOWN'}).at(-1), /尚未确认/);
  assert.equal(runtimeStepName('SET_STARTUP'), '设置目标模式自启动');
  assert.match(runtimeEvidence({examAware:'EXITED', classIsland:'READY', startup:'DAILY_MODE_APPLIED'}).join(' '), /已退出.*已就绪.*ClassIsland 已开启/);
});
test('runtime UI blocks unavailable binding but accepts priority and recovery requests', () => {
  const status = ready(); assert.equal(runtimeBlockedReason(status, Date.now()), '');
  for (const change of [{policy: {...status.policy, enabled: false}}, {sampleAsOf: '2000-01-01T00:00:00Z'},
    {policy: {...status.policy, pairedExamControl: false}}])
    assert.ok(runtimeBlockedReason({...status, ...change}, Date.now()));
  for (const change of [{status: {...status.status, recording: 'RECORDING'}}, {status: {...status.status, noticeOpen: true}},
    {status: {...status.status, remoteExamPause: true, runtimePhase: 'RECOVERY_REQUIRED'}}, {unresolvedOperationId: randomUUID()}])
    assert.equal(runtimeBlockedReason({...status,...change},Date.now()), '');
  const body = runtimeCreateBody(status);
  assert.deepEqual(Object.keys(body).sort(), ['target','scope','expectedRuntimeRevision','expectedModeRevision','expectedConfigurationRevision','consentId','policyRevision','controlEpoch'].sort());
  assert.equal(body.target, 'EXAM'); assert.equal(body.scope, 'EXAM_MODE');
  assert.equal(runtimeCreateBody(status, 'DAILY').target, 'DAILY');
  assert.equal(runtimeBlockedReason(status, Date.now(), 'DAILY'), '');
  assert.ok(runtimeBlockedReason({...status, policy:{...status.policy, remoteDailyControl:false}}, Date.now(), 'DAILY'));
});
let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => { h.reset(); h.api.saveAccountTokens({accessToken: 'access', refreshToken: 'session-a'}); });
const envelope = (id, data) => ({protocolVersion: '0.4', requestId: id, serverTime: new Date().toISOString(), data});
function routes(device, status = ready()) {
  const path = `/api/v2/npep/schools/school/devices/${device}`;
  h.routes.set(`GET ${path}/runtime-status`, (req, reply) => reply(envelope(req.headers['x-request-id'], status), 200, true));
  h.routes.set(`GET ${path}/runtime-operations`, (req, reply) => reply(envelope(req.headers['x-request-id'], {items: [], nextCursor: null}), 200, true));
  return path;
}
test('web runtime panel requires confirmation, uses 0.4 and retries ambiguous create with the same ID', async () => {
  const device = randomUUID(), path = routes(device), requests = [];
  h.routes.set(`POST ${path}/runtime-operations`, (req, reply) => {
    assert.equal(req.headers['x-npep-version'], '0.4'); requests.push(req.body);
    if (requests.length === 1) return reply({error: {code: 'TEMPORARILY_UNAVAILABLE'}}, 503);
    reply(envelope(req.body.requestId, {operationId: randomUUID(), state: 'QUEUED'}), 201, true);
  });
  const {state} = await h.openComponent('/src/components/admin/NpepRuntimeControl.vue', {schoolId: 'school', deviceId: device});
  await eventually(() => assert.ok(state.snapshot.value));
  await state.create(); assert.equal(requests.length, 0);
  state.confirmed.value = true; await state.create(); assert.ok(state.pending.value);
  await state.create(); assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
  assert.equal(state.pending.value, null); assert.match(state.message.value, /请求已登记/);
});
test('web runtime panel discards a late status from a previously selected device', async () => {
  const old = randomUUID(), next = randomUUID(), path = routes(old), held = deferred(); routes(next);
  h.routes.set(`GET ${path}/runtime-status`, async (req, reply) => { await held.promise; reply(envelope(req.headers['x-request-id'], {...ready(), controlEpoch: 'old-device'}), 200, true); });
  const {state, props} = await h.openComponent('/src/components/admin/NpepRuntimeControl.vue', {schoolId: 'school', deviceId: old});
  await eventually(() => assert.ok(h.requests.some(r => r.path === `${path}/runtime-status`)));
  props.deviceId = next; await eventually(() => assert.ok(state.snapshot.value)); held.resolve();
  await new Promise(resolve => setTimeout(resolve, 50)); assert.notEqual(state.snapshot.value.controlEpoch, 'old-device');
});

test('web Daily request keeps its target and ID across a lost response and blocks opposite retry', async () => {
  const device = randomUUID(), path = routes(device), requests = [];
  h.routes.set(`POST ${path}/runtime-operations`, (req, reply) => {
    requests.push(req.body);
    if (requests.length === 1) return reply({error:{code:'TEMPORARILY_UNAVAILABLE'}},503);
    reply(envelope(req.body.requestId, {operationId:randomUUID(), target:'DAILY', state:'QUEUED'}),201,true);
  });
  const {state} = await h.openComponent('/src/components/admin/NpepRuntimeControl.vue', {schoolId:'school',deviceId:device});
  await eventually(() => assert.ok(state.snapshot.value));
  await state.create('DAILY'); assert.equal(requests.length,0);
  state.confirmed.value=true; await state.create('DAILY'); assert.equal(state.pending.value.body.target,'DAILY');
  await state.create('EXAM'); assert.equal(requests.length,1);
  await state.create('DAILY'); assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[1].target,'DAILY'); assert.equal(state.pending.value,null);
});
