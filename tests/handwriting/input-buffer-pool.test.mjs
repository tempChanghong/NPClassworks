import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputBufferPool, INPUT_BUFFER_BYTES } from '../../src/features/handwriting/input-buffer-pool.js';
const transfer = buffer => globalThis.structuredClone(buffer, { transfer: [buffer] });
test('pool reuses transferred storage and zeroes full capacity including tail', () => {
  const pool = new InputBufferPool();
  const a = pool.take(48 * 3 * 1536); a.fill(3.5); const returned = transfer(transfer(a.buffer)); pool.accept([returned]);
  const b = pool.take(48 * 3 * 320);
  assert.equal(b.buffer, returned); assert.equal(b.length, 48 * 3 * 320);
  assert.ok(new Float32Array(b.buffer).every(n => n === 0)); assert.equal(pool.stats().allocations, 1);
});
test('pool bounds leases at three and rejects invalid lengths', () => {
  const pool = new InputBufferPool(); for (const n of [-1, 0, .5, NaN, Infinity, INPUT_BUFFER_BYTES]) assert.throws(() => pool.take(n));
  const rows = [pool.take(100), pool.take(200), pool.take(300)]; assert.throws(() => pool.take(400));
  pool.accept(rows.map(r => transfer(transfer(r.buffer)))); assert.equal(pool.stats().available, 3);
});
test('malformed or duplicate returns never partially fill the pool', () => {
  for (const make of [() => [], b => [b, b], () => [new ArrayBuffer(1)], () => [null]]) {
    const pool = new InputBufferPool(), a = pool.take(100), b = transfer(transfer(a.buffer));
    assert.throws(() => pool.accept(make(b))); assert.equal(pool.stats().available, 0); assert.equal(pool.stats().borrowed, 1);
    pool.accept([b]); assert.equal(pool.stats().available, 1);
  }
});
test('non-detached and foreign shared storage cannot be accepted', () => {
  const pool = new InputBufferPool(); pool.take(100);
  assert.throws(() => pool.accept([new ArrayBuffer(INPUT_BUFFER_BYTES)]));
  assert.throws(() => pool.accept([new SharedArrayBuffer(INPUT_BUFFER_BYTES)]));
});
test('clear drops all scope leases and permits a fresh request', () => {
  const pool = new InputBufferPool(); const old = pool.take(100); pool.clear();
  assert.equal(pool.owns(old.buffer), false); assert.equal(pool.stats().retainedCapacity, 0);
  const a = pool.take(100), b = transfer(transfer(a.buffer)); pool.accept([b]); assert.equal(pool.stats().allocations, 1);
});
