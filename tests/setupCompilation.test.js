import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse, compileScript} from 'vue/compiler-sfc';
import {transformWithEsbuild} from 'vite';

test('setup page compiles without assigning a v-model replacement to a const reactive object', async () => {
  const source = await readFile(new URL('../src/pages/setup.vue', import.meta.url), 'utf8');
  const {descriptor, errors} = parse(source);
  assert.deepEqual(errors, []);
  const compiled = compileScript(descriptor, {id: 'setup-page-regression', inlineTemplate: true});
  const result = await transformWithEsbuild(compiled.content, 'setup-page.js');
  assert.deepEqual(result.warnings, []);
});
