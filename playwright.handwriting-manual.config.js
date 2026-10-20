import {defineConfig} from '@playwright/test';
import fullstack from './playwright.handwriting-fullstack.config.js';

const smoke = process.env.HANDWRITING_ACCEPTANCE_MODE === 'smoke';
export default defineConfig({
  ...fullstack,
  testDir: './tests/handwriting-manual',
  testMatch: 'acceptance.spec.js',
  timeout: smoke ? 120000 : 60 * 60 * 1000,
  use: {...fullstack.use, headless: smoke, viewport: null, actionTimeout: 15000, navigationTimeout: 30000,
    // Keep the real OS display scale and 100% page zoom. No emulated DPR/touch.
    launchOptions: {args: smoke ? [] : ['--start-maximized']},
    // Human ink may be private; this opt-in session never records screenshots/video/trace.
    trace: 'off', screenshot: 'off', video: 'off'},
});
