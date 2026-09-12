import {defineConfig} from "@playwright/test";
import fullstack from "./playwright.fullstack.config.js";

export default defineConfig(fullstack, {
  testDir: "./tests/upgrade", timeout: 90000,
  outputDir: "test-results/upgrade",
});
