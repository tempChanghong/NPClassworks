import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
test('invalid manual combinations are rejected before opening a backend or database', () => {
  for (const args of [['--manual', '--manual-smoke'], ['--manual', '--grep', 'anything'], ['--manual-smoke', '--headed']]) {
    const result = spawnSync(process.execPath, ['scripts/run-handwriting-fullstack.js', ...args], {
      cwd: root, encoding: 'utf8', windowsHide: true,
      env: {...process.env, CLASSWORKS_BACKEND_ROOT: 'missing-backend-must-not-be-opened'},
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Choose only --manual or --manual-smoke/);
    assert.doesNotMatch(result.stdout, /PASS:|HANDWRITING_KV_RESULT/);
  }
});

for (const mode of ['interactive', 'smoke']) test(`${mode}: acceptance uses actual window scaling and does not capture private ink`, async () => {
  const previous = process.env.HANDWRITING_ACCEPTANCE_MODE;
  try {
    process.env.HANDWRITING_ACCEPTANCE_MODE = mode;
    const {default: config} = await import(`../playwright.handwriting-manual.config.js?test-mode=${mode}`);
    assert.equal(config.use.viewport, null);
    assert.equal(config.use.deviceScaleFactor, undefined);
    assert.equal(config.use.hasTouch, undefined);
    assert.equal(config.use.headless, mode === 'smoke');
    assert.ok(config.use.actionTimeout > 0 && config.use.actionTimeout < 120000);
    for (const key of ['trace', 'screenshot', 'video']) assert.equal(config.use[key], 'off');
    assert.equal(config.testDir, './tests/handwriting-manual');
  } finally {
    if (previous === undefined) delete process.env.HANDWRITING_ACCEPTANCE_MODE;
    else process.env.HANDWRITING_ACCEPTANCE_MODE = previous;
  }
});
