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
