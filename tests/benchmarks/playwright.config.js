import {defineConfig} from "@playwright/test";
import {resolve} from "node:path";
import base from "../../playwright.config.js";

export default defineConfig({...base, testDir: ".", outputDir: resolve("test-results/notice-benchmark"),
  webServer: {...base.webServer, cwd: resolve(".")}});
