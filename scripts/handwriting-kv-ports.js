import net from 'node:net';
import {randomInt} from 'node:crypto';

// Windows can assign low ephemeral ports that Chromium rejects (e.g. 6566).
// Reserve distinct ports in the dynamic/private range, then hand them to the
// owned services. Never disable the browser's unsafe-port protection.
export async function allocateLoopbackPorts(count = 3, next = () => randomInt(49152, 65536)) {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new RangeError('Invalid test port count');
  const held = [];
  try {
    for (let attempt = 0; held.length < count && attempt < 64; attempt++) {
      const candidate = next();
      if (!Number.isInteger(candidate) || candidate < 49152 || candidate > 65535) throw new RangeError('Invalid test port range');
      const server = net.createServer();
      try {
        await new Promise((resolve, reject) => server.once('error', reject).listen(candidate, '127.0.0.1', resolve));
        held.push(server);
      } catch (error) {
        if (error.code !== 'EADDRINUSE') throw error;
      }
    }
    if (held.length !== count) throw new Error('Unable to reserve distinct loopback test ports');
    return held.map(server => server.address().port);
  } finally {
    await Promise.all(held.map(server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
  }
}
