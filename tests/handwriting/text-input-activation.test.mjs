import test from 'node:test';
import assert from 'node:assert/strict';
import {beginTextInputActivation} from '../../src/utils/textInputActivation.js';

test('only the latest lazy field activation can open, even when old cleanup finishes later', () => {
  const required = beginTextInputActivation();
  assert.equal(required.current(), true);
  const optional = beginTextInputActivation();
  assert.equal(required.current(), false);
  assert.equal(optional.current(), true);
  required.release();
  assert.equal(optional.current(), true);
  optional.release();
  assert.equal(optional.current(), false);
});

test('canceling the latest activation cannot revive an older field or affect a later retry', () => {
  const old = beginTextInputActivation(), current = beginTextInputActivation();
  current.release();
  assert.equal(current.current(), false);
  assert.equal(old.current(), false);
  const retry = beginTextInputActivation();
  old.release(); current.release();
  assert.equal(retry.current(), true);
  retry.release();
});

test('superseding an activation promptly settles its wait without canceling the shared download', async () => {
  let complete;
  const download = new Promise(resolve => { complete = resolve; });
  const first = beginTextInputActivation();
  const canceled = assert.rejects(first.wait(download), {name: 'AbortError'});
  const next = beginTextInputActivation(), waiting = next.wait(download);
  await canceled;
  first.release();
  const module = {default: {name: 'Editor'}};
  complete(module);
  assert.equal(await waiting, module);
  assert.equal(next.current(), true);
  next.release();
});

test('a released activation never waits on or revives a late download', async () => {
  const request = beginTextInputActivation();
  request.release();
  await assert.rejects(request.wait(Promise.resolve({default: {}})), {name: 'AbortError'});
  assert.equal(request.current(), false);
});

test('canceling a download wait also consumes a later network rejection', async () => {
  let fail;
  const request = beginTextInputActivation();
  const waiting = assert.rejects(request.wait(new Promise((_, reject) => { fail = reject; })), {name: 'AbortError'});
  request.release(); await waiting;
  fail(new Error('late network failure'));
  await new Promise(resolve => globalThis.setImmediate(resolve));
});
