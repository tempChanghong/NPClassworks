import {before, beforeEach, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {TextEncoder} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';
let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => { h.reset(); h.api.saveAccountTokens({accessToken: 'test', refreshToken: 'test-session'}); });
const envelope = (id, data) => ({protocolVersion: '0.5', requestId: id, serverTime: new Date().toISOString(), data});
function routes(deviceId) {
  const id = randomUUID();
  const view = {online: true, receivedAt: new Date().toISOString(), items: [],
    context: {identity: {serverInstanceId: id, deploymentEpoch: id, deviceId, bindingRevision: 1, credentialGeneration: 1}, runId: id, sessionId: id, statusEpoch: 1, controlEpoch: id},
    status: {enabled: true, consentId: id, policyRevision: 1, revision: 1, available: true, blockReason: null, preparedId: null, player: {known: true, sessions: [], lastSession: null}}};
  const path = `/api/v2/npep/schools/school/devices/${deviceId}/exam-plans`;
  h.routes.set(`GET ${path}`, (req, reply) => reply(envelope(req.headers['x-request-id'], view), 200, true));
  return {path, view};
}
test('plan panel keeps exact file snapshot and request ID across uncertain delivery', async () => {
  const device = randomUUID(), {path} = routes(device), requests = [];
  h.routes.set(`POST ${path}`, (req, reply) => {
    assert.equal(req.headers['x-npep-version'], '0.5'); requests.push(req.body);
    if (requests.length === 1) return reply({error: {code: 'TEMPORARILY_UNAVAILABLE'}}, 503);
    reply(envelope(req.body.requestId, {operationId: randomUUID(), state: 'QUEUED'}), 201, true);
  });
  const {state} = await h.openComponent('/src/components/admin/NpepExamPlanControl.vue', {schoolId: 'school', deviceId: device});
  await eventually(() => assert.ok(state.view.value));
  await state.choose(new File(['{"examName":"first"}'], 'first.json')); await state.create();
  assert.ok(state.pending.value);
  await state.choose(new File(['{"examName":"second"}'], 'second.json')); await state.retry();
  assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]); assert.equal(requests[0].fileName, 'first.json');
  assert.equal(state.pending.value, null);
});
test('plan panel discards old-device status and a file read completed after changing target', async () => {
  const old = randomUUID(), next = randomUUID(), a = routes(old), b = routes(next), held = deferred();
  h.routes.set(`GET ${a.path}`, async (req, reply) => { await held.promise; reply(envelope(req.headers['x-request-id'], a.view), 200, true); });
  const {state, props} = await h.openComponent('/src/components/admin/NpepExamPlanControl.vue', {schoolId: 'school', deviceId: old});
  await eventually(() => assert.ok(h.requests.some(r => r.path === a.path)));
  const fileRead = deferred();
  const selecting = state.choose({name: 'old.json', size: 2, arrayBuffer: () => fileRead.promise});
  props.deviceId = next;
  await eventually(() => assert.equal(state.view.value?.context.identity.deviceId, b.view.context.identity.deviceId));
  held.resolve(); fileRead.resolve(new TextEncoder().encode('{}').buffer); await selecting;
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(state.view.value.context.identity.deviceId, next); assert.equal(state.canSend.value, false);
});
