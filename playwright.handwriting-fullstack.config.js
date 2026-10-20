import {defineConfig} from '@playwright/test';
import fullstack from './playwright.fullstack.config.js';

export default defineConfig({
  ...fullstack,
  testDir: './tests/handwriting-fullstack',
  testMatch: 'handwriting.spec.js',
  timeout: 120000,
  outputDir: process.env.HANDWRITING_KV_OUTPUT || 'test-results/handwriting-kv',
  use: {...fullstack.use, channel: 'msedge'},
});
