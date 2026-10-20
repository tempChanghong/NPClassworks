import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {verifyHandwritingAssets} from '../../scripts/handwriting-assets.js';
import pins, {resolveResourcePins} from '../../src/features/handwriting/resource-pins.js';
import manifest from '../../src/features/handwriting/pinned-resources.json' with {type: 'json'};
import {normalizeHomeworkText} from '../../src/features/handwriting/context.js';

test('all 19 production payloads and licenses match the validated FP32 runtime', async () => {
  const checked = await verifyHandwritingAssets(resolve('.'));
  assert.equal(checked.files.length, 19);
  assert.equal(checked.inputReuseVersion, 1);
});
for (const root of ['https://school.test/', 'https://school.test/classworks/']) {
  test(`page and resource Worker resolve the same resources under ${root}`, () => {
    for (const chunk of ['assets/editor-AbCd.js', 'assets/resource-worker-EfGh.js']) {
      const resolved = resolveResourcePins(manifest, new URL(chunk, root).href);
      assert.ok(resolved.files.every(file => file.path.startsWith(`${root}handwriting/r19/`)));
      assert.equal(resolved.files.at(-1).sha256, manifest.files.at(-1).sha256);
    }
  });
}
test('development resources use the Vite base instead of source module depth', () => {
  const resolved = resolveResourcePins(manifest, 'https://school.test/src/features/handwriting/pins.js', true, '/classworks/');
  assert.ok(resolved.files.every(file => file.path.startsWith('https://school.test/classworks/handwriting/r19/')));
  assert.equal(pins.files.length, 19);
});
for (const [input, expected] of [
  ['化学：C0、Na0H和02', '化学：CO、NaOH和O2'],
  ['完成第1O—2O页，第l、ll题', '完成第10—20页，第1、11题'],
  ['P1O~l5', 'P10~15'],
]) test(`homework context preserves established mixed-text rules: ${input}`, () => {
  assert.equal(normalizeHomeworkText(input).text, expected);
});
