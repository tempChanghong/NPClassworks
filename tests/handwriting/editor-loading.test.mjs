import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorLoader} from '../../src/features/handwriting/editor-loading.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
async function flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); }

test('concurrent editor opens share one import and successful loads do not need another entry', async () => {
  let calls = 0;
  const entry = deferred(), module = {default: {name: 'Editor'}};
  const load = createEditorLoader([() => { calls++; return entry.promise; }]);
  const first = load(), second = load();
  assert.equal(first, second);
  entry.resolve(module);
  assert.equal(await first, module); assert.equal(await second, module);
  assert.equal(await load(), module); assert.equal(calls, 1);
});

for (const late of ['resolve', 'reject']) test(`a silent import times out for all waiters; late ${late} cannot replace or retire the retry`, async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const old = deferred(), retry = deferred(), module = {default: {name: 'RetryEditor'}};
  let calls = 0;
  const load = createEditorLoader([() => { calls++; return old.promise; }, () => { calls++; return retry.promise; }]);
  const first = load();
  assert.equal(load(), first);
  const failed = assert.rejects(first, error => error.loadTimedOut === true && error.requiresReload === false);
  await flush(); t.mock.timers.tick(90001); await failed;
  const next = load(); await flush();
  if (late === 'resolve') old.resolve({default: {name: 'ExpiredEditor'}});
  else old.reject(new Error('late network error'));
  await flush();
  assert.equal(load(), next);
  retry.resolve(module);
  assert.equal(await next, module); assert.equal(await load(), module); assert.equal(calls, 2);
});

test('failed or synchronously throwing entries exhaust a finite retry budget and clear their timers', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let calls = 0;
  const load = createEditorLoader([
    () => { calls++; return Promise.reject(new Error('first download failed')); },
    () => { calls++; throw new Error('second download failed'); },
  ]);
  await assert.rejects(load(), error => error.message === 'first download failed' && !error.requiresReload);
  await assert.rejects(load(), error => error.message === 'second download failed' && error.requiresReload);
  t.mock.timers.tick(90001);
  await assert.rejects(load(), error => error.requiresReload === true);
  assert.equal(calls, 2);
});

test('the last silent entry times out with an explicit reload requirement rather than retrying forever', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const load = createEditorLoader([() => new Promise(() => {})]);
  const failed = assert.rejects(load(), error => error.loadTimedOut === true && error.requiresReload === true);
  await flush(); t.mock.timers.tick(90001); await failed;
  await assert.rejects(load(), error => error.requiresReload === true);
});
