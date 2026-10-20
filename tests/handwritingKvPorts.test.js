import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {allocateLoopbackPorts} from '../scripts/handwriting-kv-ports.js';

async function reserve(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  return server;
}
const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

test('isolated browser ports are distinct, browser-safe and released for the owned services', async () => {
  const ports = await allocateLoopbackPorts();
  assert.equal(new Set(ports).size, 3);
  const servers = [];
  try {
    for (const port of ports) {
      assert.ok(port >= 49152 && port <= 65535);
      servers.push(await reserve(port));
    }
  } finally { await Promise.all(servers.map(close)); }
});

test('a collision is skipped without closing another process listener', async () => {
  const [busy, free] = await allocateLoopbackPorts(2), server = await reserve(busy);
  let attempts = 0;
  try {
    assert.deepEqual(await allocateLoopbackPorts(1, () => ++attempts === 1 ? busy : free), [free]);
    assert.equal(server.listening, true);
  } finally { await close(server); }
});

test('failed multi-port allocation releases its partial reservation', async () => {
  const [port] = await allocateLoopbackPorts(1);
  await assert.rejects(allocateLoopbackPorts(2, () => port), /Unable to reserve distinct/);
  await close(await reserve(port));
});

test('unsafe candidates and invalid counts fail instead of bypassing browser protection', async () => {
  for (const count of [0, 11, NaN]) await assert.rejects(allocateLoopbackPorts(count), RangeError);
  await assert.rejects(allocateLoopbackPorts(1, () => 6566), RangeError);
});
