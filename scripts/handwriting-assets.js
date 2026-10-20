import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

// Fixed, offline-distributed model/runtime: fail the build rather than ship a
// partially copied lab, changed weights, or an unversioned runtime.
export async function verifyHandwritingAssets(root) {
  const pins = JSON.parse(await readFile(resolve(root, 'src/features/handwriting/pinned-resources.json'), 'utf8'));
  if (pins.version !== 'r19' || pins.files.length !== 19 || new Set(pins.files.map(file => file.path)).size !== 19) {
    throw Error('Invalid handwriting resource manifest');
  }
  for (const file of pins.files) {
    if (!/^r19\/[a-zA-Z0-9./-]+$/.test(file.path) || file.path.includes('..')) throw Error('Invalid handwriting resource path');
    const bytes = await readFile(resolve(root, 'public/handwriting', file.path));
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw Error(`Handwriting resource differs from validated runtime: ${file.path}`);
    }
  }
  for (const license of ['ONNX-Runtime-MIT.txt', 'PaddleOCR-Apache-2.0.txt', 'RapidOCR-Apache-2.0.txt']) {
    if ((await readFile(resolve(root, 'public/handwriting/licenses', license))).length < 1000) throw Error(`Missing handwriting license: ${license}`);
  }
  return pins;
}

export function handwritingAssets() {
  return {
    name: 'verified-handwriting-assets',
    async buildStart() { await verifyHandwritingAssets(process.cwd()); },
  };
}
