import {defineConfig} from '@playwright/test';
import fullstack from './playwright.fullstack.config.js';

export default defineConfig({
  ...fullstack,
  testDir: './tests/handwriting-fullstack',
  testMatch: 'handwriting.spec.js',
  timeout: 120000,
  outputDir: process.env.HANDWRITING_KV_OUTPUT || 'test-results/handwriting-kv',
  // Use the installed school browser locally; Linux CI installs Chromium.
  use: {...fullstack.use, ...(process.platform === 'win32' ? {channel: 'msedge'} : {})},
});
