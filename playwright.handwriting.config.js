import {defineConfig} from '@playwright/test';
import {origin} from './tests/e2e/environment.js';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'handwriting.spec.js',
  outputDir: 'test-results/handwriting-production',
  workers: 1,
  timeout: 90000,
  expect: {timeout: 12000},
  use: {channel: 'msedge', headless: true, serviceWorkers: 'allow', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  webServer: {command: 'node scripts/serve-e2e.js', url: origin, timeout: 120000, reuseExistingServer: false},
});
