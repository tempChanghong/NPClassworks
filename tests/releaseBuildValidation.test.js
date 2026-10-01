import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ESLint} from 'eslint';

const root = fileURLToPath(new URL('../', import.meta.url));
const validator = resolve(root, 'scripts/validate-pwa-build.js');

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'npclassworks-pwa-check-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const output = join(directory, 'candidate');
  mkdirSync(join(output, 'assets'), {recursive: true});
  for (const name of ['192.png', '512.png', 'shot.png']) writeFileSync(join(output, name), 'fixture');
  writeFileSync(join(output, 'manifest.webmanifest'), JSON.stringify({
    id: '7C24F2B3.ClassworksPWA', name: 'test', short_name: 'test', description: 'test',
    start_url: '/', scope: '/', display: 'standalone', theme_color: '#ffffff', background_color: '#ffffff',
    icons: [{src: '192.png', sizes: '192x192'}, {src: '512.png', sizes: '512x512', purpose: 'any maskable'}],
    categories: ['education'], screenshots: [{src: 'shot.png', sizes: '192x192', type: 'image/png'}],
    file_handlers: [{accept: {'application/json': ['.csb', '.csi']}}],
    protocol_handlers: [{protocol: 'cs', url: '/?uri=%s'}],
  }));
  writeFileSync(join(output, 'index.html'), '<link rel="manifest"><link rel="apple-touch-icon"><meta name="msapplication-TileImage">');
  writeFileSync(join(output, 'sw-cache-manager.js'), '');
  writeFileSync(join(output, 'sw.js'), 'importScripts("sw-cache-manager.js");precacheAndRoute([{url:"index.html"}],{});');
  return {directory, output};
}

function run(directory, args) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: directory, encoding: 'utf8', env: {...process.env, VITE_ENABLE_ANALYTICS: 'false'}, windowsHide: true,
  });
}

test('PWA validator checks the selected build instead of another dist directory', t => {
  const {directory, output} = fixture(t);
  mkdirSync(join(directory, 'dist')); // Default output is intentionally incomplete.
  const result = run(directory, ['--dist', output]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /校验通过/);
  assert.equal(run(directory, []).status, 1);
});

test('PWA validator rejects missing worker in the selected output', t => {
  const {directory, output} = fixture(t);
  rmSync(join(output, 'sw.js'));
  const result = run(directory, ['--dist', output]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sw\.js.*不存在/);
});

test('PWA validator still rejects bundled analytics when disabled', t => {
  const {directory, output} = fixture(t);
  writeFileSync(join(output, 'assets', 'tracker.js'), 'fetch("https://clarity.ms/collect");');
  const result = run(directory, ['--dist', output]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /分析或设备指纹/);
});

test('PWA validator rejects malformed options instead of silently checking default output', t => {
  const {directory} = fixture(t);
  for (const args of [['--dist'], ['--other', 'candidate'], ['--dist', '  ']]) {
    assert.equal(run(directory, args).status, 2);
  }
});

test('lint ignores generated acceptance caches and keeps checking authored source', async () => {
  const eslint = new ESLint({cwd: root});
  for (const file of ['.artifacts/noise-schedules/vite-cache/deps/vue.js', '.cache/dev-scan-verification/deps/axios.js']) {
    assert.equal(await eslint.isPathIgnored(resolve(root, file)), true);
  }
  assert.equal(await eslint.isPathIgnored(resolve(root, 'scripts/test-noise-schedules-browser.mjs')), false);
  const results = await eslint.lintText('releaseCheckUndeclared();', {filePath: resolve(root, 'src/utils/release-check.js')});
  assert.ok(results[0].messages.some(message => message.ruleId === 'no-undef'));
});
