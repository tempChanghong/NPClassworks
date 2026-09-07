import {defineConfig} from "@playwright/test";
import {origin} from "./tests/e2e/environment.js";

export default defineConfig({
  testDir: "./tests/fullstack", testMatch: "**/*.spec.js",
  workers: 1, fullyParallel: false, timeout: 60000, retries: 0,
  outputDir: "test-results/fullstack",
  expect: {timeout: 10000},
  use: {baseURL: origin, browserName: "chromium", serviceWorkers: "allow",
    timezoneId: "Asia/Shanghai", viewport: {width: 1440, height: 1000},
    trace: "retain-on-failure", screenshot: "only-on-failure"},
  webServer: {command: "node scripts/serve-fullstack.js", url: origin, timeout: 120000, reuseExistingServer: false},
});
