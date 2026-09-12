// Read-only browser benchmark: node tests/benchmarks/homework-images.mjs
// CPU throttling is a repeatable approximation, not a measurement on classroom hardware.
import {chromium} from "@playwright/test";
import {readFile} from "node:fs/promises";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const source = await readFile(new URL("../../src/utils/homeworkImages.js", import.meta.url), "utf8");
  await page.addScriptTag({type: "module", content: `${source}\nwindow.imagePlanners = {planHomeworkImages, planHomeworkImagesAsync};`});
  await page.waitForFunction(() => window.imagePlanners);
  const cdp = await page.context().newCDPSession(page);
  for (const rate of [1, 6]) {
    await cdp.send("Emulation.setCPUThrottlingRate", {rate});
    for (const chars of [10000, 100000]) {
      const result = await page.evaluate(async ({rate, chars}) => {
        const snapshot = {className: "高一一班", boardDate: "2026-09-12", scopeLabel: "行政班", generatedAt: "2026-09-12 12:00",
          items: [{subject: "数学", targets: "一班", certification: "教师已确认", priority: "普通", deadline: "明天",
            content: "长作业内容测试".repeat(Math.ceil(chars / 7)).slice(0, chars)}]};
        async function run(mode) {
          const context = document.createElement("canvas").getContext("2d"), widths = new Map();
          const controller = new AbortController();
          const measure = (text, font) => {
            const key = font + text;
            if (!widths.has(key)) { context.font = font; widths.set(key, context.measureText(text).width); }
            return widths.get(key);
          };
          const start = globalThis.performance.now();
          let timerLatencyMs, pages = 0, cancelled = false;
          const timer = new Promise(resolve => setTimeout(() => {
            timerLatencyMs = globalThis.performance.now() - start;
            if (mode === "cancel") controller.abort();
            resolve();
          }, 0));
          try {
            const planned = mode === "sync"
              ? window.imagePlanners.planHomeworkImages(snapshot, measure)
              : await window.imagePlanners.planHomeworkImagesAsync(snapshot, measure, {signal: controller.signal});
            pages = planned.length;
          } catch (error) {
            if (!controller.signal.aborted) throw error;
            cancelled = true;
          }
          const elapsedMs = globalThis.performance.now() - start;
          await timer;
          return {elapsedMs, timerLatencyMs, pages, cancelled};
        }
        return {rate, chars, sync: await run("sync"), cooperative: await run("async"), cancel: await run("cancel")};
      }, {rate, chars});
      console.log(JSON.stringify(result));
    }
  }
} finally { await browser.close(); }
