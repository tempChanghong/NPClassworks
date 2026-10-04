import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';
import {saveNoiseScheduleSettings} from '../src/utils/noiseScheduleSettings.js';

test('noise API uses screen identity even when an administrator session is also present', async t => {
  const h = await createFlowHarness(); t.after(() => h.close()); h.newStore({screen: true});
  h.unlockScreen();
  h.api.saveAccountTokens({accessToken: 'fixture-admin-token', refreshToken: 'fixture-admin-refresh'});
  h.routes.set('GET /api/v2/npep/screen/noise', (req, reply) => {
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers['x-classworks-screen-token'], 'screen-a-token');
    reply({protocolVersion: '0.6', requestId: req.headers['x-request-id'], serverTime: new Date().toISOString(),
      data: {provider: 'browser', reports: []}}, 200, true);
  });
  assert.equal((await h.api.npepNoiseApi.screen()).provider, 'browser');
});

test('native provider cancels browser scheduling and late microphone permission cannot restart it', async t => {
  const h = await createFlowHarness(); t.after(() => h.close()); h.newStore({screen: true});
  saveNoiseScheduleSettings('screen-a', {enabled: true, startTime: '00:00', endTime: '23:59'});
  t.mock.timers.enable({apis: ['Date'], now: new Date('2026-09-30T12:00:00+08:00')});
  const permission = deferred(); let captures = 0;
  window.AudioContext = class {close() { return Promise.resolve(); }};
  navigator.mediaDevices = {getUserMedia() { captures++; return permission.promise; }};
  const manager = await h.openNoiseScheduler(); assert.equal(manager.noiseService.status, 'initializing');
  h.routes.set('GET /api/v2/npep/screen/noise', (req, reply) => reply({protocolVersion: '0.6', requestId: req.headers['x-request-id'],
    serverTime: new Date().toISOString(), data: {provider: 'native', online: false, status: null, commands: [], reports: []}}, 200, true));
  await manager.nativeNoise.poll(); assert.equal(manager.noiseService.status, 'paused');
  const track = {stopped: false, stop() { this.stopped = true; }};
  permission.resolve({getTracks: () => [track]}); await permission.promise; await Promise.resolve(); await Promise.resolve();
  assert.equal(track.stopped, true); assert.equal(captures, 1);
  h.routes.set('GET /api/v2/npep/screen/noise', (_req, reply) => reply({message: 'offline'}, 503));
  await manager.nativeNoise.poll(); assert.equal(manager.nativeNoiseState.value.provider, 'native');
  assert.equal(manager.noiseService.status, 'paused'); assert.equal(captures, 1);
});

test('late native noise and schedule responses are discarded after screen credentials are cleared', async t => {
  const h = await createFlowHarness(); t.after(() => h.close()); h.newStore({screen: true});
  const hold = deferred();
  for (const [path, version] of [['noise', '0.6'], ['noise-schedule', '0.7']]) {
    h.routes.set(`GET /api/v2/npep/screen/${path}`, async (req, reply) => {
      await hold.promise;
      reply({protocolVersion: version, requestId: req.headers['x-request-id'], serverTime: new Date().toISOString(),
        data: {online: true, status: {state: 'Active'}}}, 200, true);
    });
  }
  const responses = [h.api.npepNoiseApi.screen(), h.api.npepNoiseScheduleApi.screen()]
    .map(request => request.catch(error => error));
  await eventually(() => assert.equal(h.requests.length, 2));
  h.api.clearClassroomScreenToken(); hold.resolve();
  for (const response of await Promise.all(responses)) assert.equal(response.code, 'ERR_CANCELED');
});
