import {defineConfig} from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  expect: {timeout: 10000},
  retries: 0,
  use: {baseURL: "http://127.0.0.1:4180", browserName: "chromium", serviceWorkers: "allow",
    viewport: {width: 1440, height: 1000}, trace: "retain-on-failure", screenshot: "only-on-failure"},
  webServer: {command: "node scripts/serve-e2e.js", url: "http://127.0.0.1:4180", timeout: 120000, reuseExistingServer: false},
});
