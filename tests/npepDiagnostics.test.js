import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpepOverviewDiagnostics} from '../src/utils/npepDiagnostics.js';

const now = Date.parse('2026-10-04T10:00:00Z');
const uuid = 'fd6298d3-a8ad-4dac-847d-b4d831410092';
const input = () => ({now, schoolId: uuid, filter: 'ALL', stale: false, backendUrl: 'https://api.example.test:8443/private?token=secret',
  appVersion: '1.2.0', hasMore: true,
  overview: {asOf: new Date(now).toISOString(), summary: {total: 42, active: 40, online: 38, offline: 1, unreported: 1, attention: 2, inactive: 2},
    matchedTotal: 42, items: [], nextCursor: null},
  devices: [{deviceId: uuid, schoolId: uuid, administrativeClassId: uuid, screenBindingId: uuid,
    state: 'ACTIVE', connectivity: 'ONLINE', lastSeenAt: new Date(now - 1000).toISOString(), issues: [],
    status: {appVersion: 'InDev 20261002', mode: 'DAILY', modePhase: 'IDLE', modeRevision: 4, automaticRecording: 'ENABLED', recording: 'IDLE',
      classIsland: {connection: 'READY', bridgeVersion: '0.2.0.0'}, examAware: {connection: 'DISCONNECTED', bridgeVersion: null}}}],
});

test('NPEP summary exports only observed state and approved identifiers, never extra fields', () => {
  const source = input(), device = source.devices[0];
  const secret = 'DO-NOT-EXPORT-ABCD2345';
  Object.assign(source, {search: secret, code: secret, authorization: secret});
  Object.assign(device, {deviceName: secret, screenBindingName: secret, credentialId: secret, token: secret, audio: secret});
  Object.assign(device.status, {message: secret, outputFile: secret});
  device.status.classIsland.key = secret;
  const result = createNpepOverviewDiagnostics(source), json = JSON.stringify(result);
  assert.ok(!json.includes(secret)); assert.ok(!json.includes('token='));
  assert.equal(result.backendOrigin, 'https://api.example.test:8443');
  assert.equal(result.items[0].screenBindingId, uuid);
  assert.equal(result.items[0].status.classIsland.bridgeVersion, '0.2.0.0');
  assert.equal(result.summary.total, 42); assert.equal(result.exportedCount, 1); assert.equal(result.hasMore, true);
  assert.equal(result.stale, false);
  device.status.mode = 'EXAM'; assert.equal(result.items[0].status.mode, 'DAILY');
});

test('NPEP summary labels stale observations and caps loaded export without claiming full-school detail', () => {
  const source = input(); source.devices = Array(250).fill(source.devices[0]);
  source.now += 60001;
  const result = createNpepOverviewDiagnostics(source);
  assert.equal(result.stale, true); assert.equal(result.loadedCount, 250); assert.equal(result.exportedCount, 200);
  assert.equal(result.omittedLoadedCount, 50); assert.equal(result.items.length, 200);
  source.now = now; source.stale = true;
  assert.equal(createNpepOverviewDiagnostics(source).stale, true);
});

test('NPEP summary rejects unavailable school snapshot and strips unexpected values', () => {
  const source = input();
  for (const overview of [null, {}, {...source.overview, asOf: 'invalid'}]) {
    assert.throws(() => createNpepOverviewDiagnostics({...source, overview}));
  }
  source.backendUrl = 'https://username:secret@example.test'; source.appVersion = 'secret';
  source.devices[0].deviceId = 'secret'; source.devices[0].issues = ['secret', 'OFFLINE'];
  source.devices[0].status.mode = 'secret'; source.devices[0].lastSeenAt = 'secret';
  const result = createNpepOverviewDiagnostics(source);
  assert.equal(result.backendOrigin, null); assert.equal(result.appVersion, null);
  assert.equal(result.items[0].deviceId, null); assert.equal(result.items[0].lastSeenAt, null);
  assert.equal(result.items[0].status.mode, 'UNKNOWN');
  assert.deepEqual(result.items[0].issues, ['UNKNOWN', 'OFFLINE']);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
