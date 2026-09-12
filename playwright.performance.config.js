import {defineConfig} from "@playwright/test";
import fullstack from "./playwright.fullstack.config.js";

export default defineConfig(fullstack, {
  testDir: "./tests/performance", timeout: 180000,
  outputDir: "test-results/performance",
  use: {
    actionTimeout: 15000,
    channel: process.env.PERFORMANCE_BROWSER_CHANNEL || undefined,
    // Use a synthetic audio device: no access to the user's actual microphone.
    launchOptions: {args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"]},
    trace: "off", screenshot: "only-on-failure",
  },
});
