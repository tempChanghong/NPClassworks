import {after, before, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => { h.reset(); h.api.saveAccountTokens({accessToken: 'access', refreshToken: 'recovery-session'}); });
const serverTime = '2026-10-04T04:00:00.000Z';
const report = {sessionId: 'saved-report'};
const live = (receivedAt = serverTime) => ({supported: true, online: true, applied: true, receivedAt,
  policy: {version: 'policy'}, status: {reason: 'WINDOW_ACTIVE'}, sessions: [], commands: []});
const envelope = (req, data, version) => ({protocolVersion: version, requestId: req.headers['x-request-id'], serverTime, data});
function routes(device, schedule = live()) {
  const path = `/api/v2/npep/schools/school/devices/${device}`;
  h.routes.set(`GET ${path}/noise`, (req, reply) => reply(envelope(req, {reports: [report]}, '0.6'), 200, true));
  h.routes.set(`GET ${path}/noise-schedule`, (req, reply) => reply(envelope(req, schedule, '0.7'), 200, true));
  return path;
}

test('open report panel expires its last live schedule while keeping historical reports', async t => {
  let mono = 1000;
  t.mock.method(globalThis.performance, 'now', () => mono);
  t.mock.timers.enable({apis: ['setInterval', 'Date'], now: new Date('2040-01-01T00:00:00Z')});
  routes('device');
  const {state} = await h.openComponent('/src/components/admin/NpepNoiseReports.vue', {schoolId: 'school', deviceId: 'device'});
  await eventually(() => assert.equal(state.schedule.value?.online, true));
  // The browser wall clock is deliberately unrelated to the server clock.
  mono += 15000; t.mock.timers.tick(15000);
  assert.equal(state.schedule.value.online, false, 'last observation must no longer claim the device is online');
  assert.equal(state.schedule.value.applied, false);
  assert.equal(state.schedule.value.status.reason, 'WINDOW_ACTIVE', 'retain historical evidence with a stale label');
  assert.equal(state.reports.value[0].sessionId, report.sessionId);
  assert.equal(h.requests.length, 2, 'age the observation without adding background report requests');
});

test('schedule freshness includes its age at the server and time spent waiting for the other endpoint', async t => {
  let mono = 1000;
  t.mock.method(globalThis.performance, 'now', () => mono);
  t.mock.timers.enable({apis: ['setInterval']});
  const path = routes('device', live('2026-10-04T03:59:46.000Z'));
  const hold = deferred();
  h.routes.set(`GET ${path}/noise`, async (req, reply) => { await hold.promise; reply(envelope(req, {reports: [report]}, '0.6'), 200, true); });
  const {state} = await h.openComponent('/src/components/admin/NpepNoiseReports.vue', {schoolId: 'school', deviceId: 'device'});
  await eventually(() => assert.equal(h.requests.length, 2));
  mono += 2000; hold.resolve();
  await eventually(() => assert.equal(state.busy.value, false));
  assert.equal(state.schedule.value.online, false, 'a delayed response must not renew an already expired observation');
});

test('late previous-device report and schedule responses cannot replace the new device', async () => {
  const path = routes('old'); routes('new', {...live(), status: {reason: 'OUTSIDE_WINDOW'}});
  const hold = deferred();
  h.routes.set(`GET ${path}/noise-schedule`, async (req, reply) => { await hold.promise; reply(envelope(req, live(), '0.7'), 200, true); });
  const {state, props} = await h.openComponent('/src/components/admin/NpepNoiseReports.vue', {schoolId: 'school', deviceId: 'old'});
  await eventually(() => assert.equal(h.requests.length, 2));
  props.deviceId = 'new';
  await eventually(() => assert.equal(state.schedule.value?.status.reason, 'OUTSIDE_WINDOW'));
  hold.resolve(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(state.schedule.value.status.reason, 'OUTSIDE_WINDOW');
});
