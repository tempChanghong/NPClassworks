import {cpus, totalmem, platform, release} from "node:os";
import {readFileSync, writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {test, expect} from "../fullstack/fixture.js";
import {api, origin} from "../e2e/environment.js";

const presets = JSON.parse(readFileSync(new URL("../../src/utils/backgroundPresets.json", import.meta.url), "utf8"));
for (const rate of [1, 4]) test(`screen workload with real audio worklet and CPU rate ${rate}`, async ({classroom, request, browser}, testInfo) => {
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  for (let i = 0; i < 50; i++) {
    const response = await request.post(`${api}/api/v2/publications`, {headers, data: {
      type: i < 30 ? "ASSIGNMENT" : "NOTICE", status: "PUBLISHED", priority: i < 30 ? "NORMAL" : "MINOR",
      ...(i < 30 ? {subjectId: classroom.subject.id, boardDate: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), allowDuplicate: true} : {contentJson: {popupEnabled: false}}),
      content: `性能样本 ${i}\n${"请按要求完成练习，并检查步骤和单位。\n".repeat(i < 30 ? 60 : 10)}`,
      targetWorkspaceIds: [classroom.workspace.id],
    }});
    expect(response.status(), await response.text()).toBe(201);
  }
  const screen = await classroom.open("screen");
  const {page, context} = screen;
  await context.grantPermissions(["microphone"]);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", {rate});
  await cdp.send("Performance.enable");
  await page.goto(`${origin}/settings?section=appearance`);
  await page.locator(".setting-row").filter({hasText: "自定义背景"}).getByRole("checkbox").setChecked(true);
  await page.getByRole("button", {name: `使用背景：${presets[0].category} · ${presets[0].title}`, exact: true}).click();
  await expect(page.locator(".app-background-image")).toHaveCSS("background-image", /blob:/);
  await page.goto(origin);
  await page.evaluate(() => {
    window.acceptanceAudioSamples = 0;
    const ActualAudioWorkletNode = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends ActualAudioWorkletNode {
      constructor(...args) {
        super(...args);
        this.port.addEventListener("message", () => { window.acceptanceAudioSamples++; });
        this.port.start();
      }
    };
  });
  await page.getByRole("button", {name: "课堂工具", exact: true}).first().click();
  await page.locator(".tool-entry").filter({hasText: "噪声监测"}).click();
  await page.getByRole("button", {name: "开始监测", exact: true}).click();
  await expect(page.getByRole("button", {name: "停止手动监测", exact: true}).last()).toBeVisible();
  await page.getByTitle("返回课堂工具", {exact: true}).click();
  await page.getByTitle("关闭", {exact: true}).click();
  await expect(page.locator(".screen-noise-status")).toContainText("噪声监测中");
  await expect.poll(() => page.evaluate(() => window.acceptanceAudioSamples)).toBeGreaterThan(0);
  const snapshot = async () => {
    const {metrics} = await cdp.send("Performance.getMetrics");
    return Object.fromEntries(metrics.filter(m => ["JSHeapUsedSize", "Nodes", "JSEventListeners", "TaskDuration", "ScriptDuration"].includes(m.name)).map(m => [m.name, m.value]));
  };
  // Warm up lazy dialog code before measuring repeated open/close cycles.
  const focus = page.locator(".screen-homework-focus");
  const trigger = page.getByRole("button", {name: "放大查看", exact: true}).first();
  await trigger.click();
  await expect(focus).toBeVisible();
  await focus.getByRole("button", {name: "关闭放大", exact: true}).click();
  await expect(focus).not.toBeVisible();
  await page.evaluate(() => {
    window.acceptanceLongTasks = [];
    window.acceptanceObserver = new window.PerformanceObserver(list => window.acceptanceLongTasks.push(...list.getEntries().map(e => e.duration)));
    window.acceptanceObserver.observe({type: "longtask"});
  });
  const samples = [];
  await cdp.send("HeapProfiler.collectGarbage");
  const before = await snapshot();
  const audioSamplesBefore = await page.evaluate(() => window.acceptanceAudioSamples);
  for (let i = 0; i < 10; i++) {
    const started = performance.now();
    await trigger.click();
    await expect(focus).toBeVisible();
    const openMs = performance.now() - started;
    await focus.getByRole("button", {name: "关闭放大", exact: true}).click();
    await expect(focus).not.toBeVisible();
    samples.push({cycle: i + 1, automationOpenMs: Math.round(openMs), ...await snapshot()});
  }
  // Sample foreground idle with audio processing still active, without fake clocks.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 5000)));
  const after = await snapshot();
  const longTasks = await page.evaluate(() => { window.acceptanceObserver.disconnect(); return window.acceptanceLongTasks; });
  await cdp.send("HeapProfiler.collectGarbage");
  const afterGC = await snapshot();
  const audioSamplesAfter = await page.evaluate(() => window.acceptanceAudioSamples);
  expect(audioSamplesAfter).toBeGreaterThan(audioSamplesBefore);
  const result = {recordedAt: new Date().toISOString(), machine: {os: `${platform()} ${release()}`, cpu: cpus()[0]?.model,
    ramGiB: Number((totalmem() / 2 ** 30).toFixed(1)), browser: browser.version(), channel: process.env.PERFORMANCE_BROWSER_CHANNEL || "bundled Chromium"},
  cpuRate: rate, workload: {assignments: 30, notices: 20, preset: presets[0].id, microphone: "Chromium synthetic device; real AudioWorklet"},
  before, samples, after, afterGC, longTasks, audioSamplesBefore, audioSamplesAfter,
  limitations: "Headless development machine, not physical Windows 10 classroom screen. Automation timings include driver and actionability overhead. JS heap is not total browser memory. CPU slowdown does not simulate 8 GB RAM or GPU."};
  const path = testInfo.outputPath("measurements.json");
  writeFileSync(path, JSON.stringify(result, null, 2));
  await testInfo.attach("measurements", {path, contentType: "application/json"});
  // Functional assertions only: gather a baseline before inventing timing limits.
  await page.locator(".screen-noise-status").getByRole("button", {name: "停止手动监测", exact: true}).click();
  expect(screen.errors).toEqual([]);
});
