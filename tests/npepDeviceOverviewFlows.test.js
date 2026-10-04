import {before, beforeEach, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset(); h.api.saveAccountTokens({accessToken: 'admin', refreshToken: 'session-a'});
  h.routes.set('GET /api/v2/admin/schools/school/classroom-screens', (_req, reply) => reply([]));
  h.routes.set('GET /api/v2/npep/info', (req, reply) => reply(envelope(req, {}), 200, true));
});
const envelope = (req, data) => ({protocolVersion: '0.1', requestId: req.headers['x-request-id'], serverTime: new Date().toISOString(), data});
const snapshot = (extra = {}) => ({asOf: new Date().toISOString(), summary: {total: 4, active: 3, online: 2, offline: 1, unreported: 0, attention: 1, inactive: 1},
  matchedTotal: 4, items: [{deviceId: 'a', issues: []}], nextCursor: 'next', ...extra});

test('manager filters/searches on server, preserves school totals and rolls back failed filter requests', async () => {
  let fail = false;
  h.routes.set('GET /api/v2/npep/schools/school/device-overview', (req, reply) => {
    if (fail) return reply({error: {code: 'TEMPORARILY_UNAVAILABLE'}}, 503);
    assert.equal(req.query.get('limit'), '20');
    const item = req.query.has('cursor') ? {deviceId: 'b', issues: ['OFFLINE']} : {deviceId: 'a', issues: []};
    reply(envelope(req, snapshot({items: [item], nextCursor: req.query.has('cursor') ? null : 'next'})), 200, true);
  });
  const {state} = await h.openNpepManager();
  await eventually(() => assert.equal(state.loaded.value, true));
  await state.more(); assert.equal(state.devices.value.length, 2); assert.equal(state.overview.value.summary.total, 4);
  state.search.value = '  大屏  ';
  await state.applyOverview('ATTENTION');
  assert.equal(h.requests.at(-1).query.get('search'), '大屏'); assert.equal(h.requests.at(-1).query.get('filter'), 'ATTENTION');
  assert.equal(h.requests.at(-1).query.has('cursor'), false); assert.equal(state.devices.value.length, 1);
  fail = true; await state.applyOverview('ONLINE');
  assert.equal(state.filter.value, 'ATTENTION'); assert.equal(state.stale.value, true);
  assert.equal(state.overview.value.summary.total, 4); assert.equal(state.devices.value.length, 1);
});

test('old server 404 retains legacy pagination without inventing a school summary', async () => {
  h.routes.set('GET /api/v2/npep/schools/school/device-overview', (_req, reply) => reply({error: {code: 'NOT_FOUND'}}, 404));
  h.routes.set('GET /api/v2/npep/schools/school/devices', (req, reply) => reply(envelope(req, {items: [{deviceId: 'old'}], nextCursor: null}), 200, true));
  const {state} = await h.openNpepManager();
  await eventually(() => assert.equal(state.loaded.value, true));
  assert.equal(state.overviewUnavailable.value, true); assert.equal(state.overview.value, null);
  assert.equal(state.devices.value[0].deviceId, 'old');
  await state.refresh(); assert.equal(h.requests.filter(req => req.path.endsWith('device-overview')).length, 1);
});

test('invalid success is not treated as old-server support and permission loss clears the school snapshot', async () => {
  let malformed = false, forbidden = false;
  h.routes.set('GET /api/v2/npep/schools/school/device-overview', (req, reply) => {
    if (forbidden) return reply({error: {code: 'SCHOOL_ADMIN_REQUIRED'}}, 403);
    reply(envelope(req, malformed ? snapshot({summary: {total: 999}}) : snapshot()), 200, true);
  });
  const {state} = await h.openNpepManager();
  await eventually(() => assert.equal(state.loaded.value, true));
  malformed = true; await state.refresh();
  assert.equal(state.overviewUnavailable.value, false); assert.equal(state.stale.value, true);
  assert.equal(state.overview.value.summary.total, 4);
  forbidden = true; await state.refresh();
  assert.equal(state.overview.value, null); assert.equal(state.devices.value.length, 0); assert.equal(state.loaded.value, false);
});

test('late overview cannot repopulate data after switching schools', async () => {
  const held = deferred(); let entered = false;
  h.routes.set('GET /api/v2/npep/schools/school/device-overview', async (req, reply) => {
    entered = true; await held.promise; reply(envelope(req, snapshot()), 200, true);
  });
  h.routes.set('GET /api/v2/admin/schools/other/classroom-screens', (_req, reply) => reply([]));
  h.routes.set('GET /api/v2/npep/schools/other/device-overview', (req, reply) => reply(envelope(req, snapshot({items: [{deviceId: 'new-school', issues: []}]})), 200, true));
  const {state, school} = await h.openNpepManager();
  try {
    await eventually(() => assert.equal(entered, true)); school.value = 'other'; held.resolve();
    await eventually(() => assert.equal(state.devices.value[0]?.deviceId, 'new-school'));
    assert.equal(state.devices.value.length, 1);
  } finally { held.resolve(); }
});
