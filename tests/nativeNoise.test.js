import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeNoiseController} from '../src/utils/nativeNoiseController.js';
const view = {provider: 'native', online: true, status: {instanceId: 'host', revision: 1, sessionId: null, state: 'Idle'}, commands: [], reports: []};
test('native takeover stays native when offline; successful POST does not imply Active', async () => {
  let failed = false, command;
  const c = createNativeNoiseController({screen: async b => {
    if (failed) throw new Error('offline'); if (b) { command = b; return {}; } return view;
  }}, () => {});
  c.context('screen'); await c.poll(); await c.command('START');
  assert.equal(command.action, 'START'); assert.equal(c.snapshot().status.state, 'Idle');
  failed = true; await c.poll(); assert.equal(c.snapshot().provider, 'native'); assert.equal(c.snapshot().online, false);
});
test('previous scope HTTP response cannot overwrite a new classroom', async () => {
  let finish;
  const c = createNativeNoiseController({screen: () => new Promise(r => { finish = r; })}, () => {});
  c.context('A'); const pending = c.poll(); c.context('B'); finish(view); await pending;
  assert.equal(c.snapshot().provider, 'checking'); assert.equal(c.snapshot().status, null);
});
test('unknown transport errors never start browser capture; old servers retain browser mode', async () => {
  let status = 503;
  const c = createNativeNoiseController({screen: async () => { throw {response: {status}}; }}, () => {});
  c.context('screen'); await c.poll(); assert.equal(c.snapshot().provider, 'checking');
  status = 426; await c.poll(); assert.equal(c.snapshot().provider, 'browser');
});
test('remembered native provider survives page reload and old endpoint errors', async () => {
  const c = createNativeNoiseController({screen: async () => { throw {response: {status: 404}}; }}, () => {}, {get: () => 'native', set: () => {}});
  c.context('screen'); await c.poll(); assert.equal(c.snapshot().provider, 'native'); assert.equal(c.snapshot().online, false);
});
