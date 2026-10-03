import {chromium, request} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {cpus, totalmem, platform, release} from "node:os";
import {api, origin} from "../../tests/e2e/environment.js";

const client = await request.newContext();
if (!(await client.post(api + "/__test/reset")).ok()) throw new Error("Local E2E backend unavailable");
const boardDate = new Date().toLocaleDateString("sv-SE", {timeZone: "Asia/Shanghai"});
for (let i = 0; i < 50; i++) {
  const assignment = i < 30;
  const response = await client.post(api + "/api/v2/publications", {data: {
    type: assignment ? "ASSIGNMENT" : "NOTICE", priority: assignment ? "NORMAL" : "MINOR",
    subjectId: "math", boardDate, title: (assignment ? "数学练习 " : "班级通知 ") + (i + 1),
    content: ("样本 " + (i + 1) + "：请阅读并核对内容。\n").repeat(assignment ? 60 : 10),
    publishAt: new Date(Date.now() - 3_600_000).toISOString(),
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    ...(!assignment ? {contentJson: {popupEnabled: false}} : {}),
  }});
  if (!response.ok()) throw new Error("Unable to seed publication " + (i + 1));
}

const browser = await chromium.launch({headless: true});
const result = {recordedAt: new Date().toISOString(), browser: browser.version(),
  machine: {os: `${platform()} ${release()}`, cpu: cpus()[0]?.model,
    ramGiB: Number((totalmem() / 2 ** 30).toFixed(1))},
  cpuThrottle: 4, network: "loopback", workload: {assignments: 30, notices: 20,
    focusCycles: 10, foregroundIdleSeconds: 30, lifecycleFreezeSeconds: 10,
    microphone: "off", background: "default"}, modes: []};

async function snapshot(cdp, page) {
  const {metrics} = await cdp.send("Performance.getMetrics");
  const selected = Object.fromEntries(metrics.filter(item => ["JSHeapUsedSize", "Nodes", "JSEventListeners",
    "TaskDuration", "ScriptDuration"].includes(item.name)).map(item => [item.name, item.value]));
  const ui = await page.evaluate(() => {
    const tasks = window.__screenSessionTasks || [];
    return {cards: window.document.querySelectorAll(".publication-card").length,
      efficient: window.document.body.classList.contains("classworks-screen-efficient"),
      dockBlur: window.getComputedStyle(window.document.querySelector(".screen-action-dock__surface")).backdropFilter,
      longTasks: {count: tasks.length, totalMs: Math.round(tasks.reduce((sum, value) => sum + value, 0))}};
  });
  return {...selected, ...ui};
}

try {
  for (const mode of ["efficient", "standard"]) {
    const values = {
      "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: "screen"}),
      "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true}),
      "classworks-v2-screen-token": "screen-token",
      "classworks-v2-screen-display:screen-a": JSON.stringify({performanceMode: mode}),
    };
    const context = await browser.newContext({viewport: {width: 1920, height: 1080}, hasTouch: true,
      timezoneId: "Asia/Shanghai", serviceWorkers: "allow",
      storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values)
        .map(([name, value]) => ({name, value}))}]}});
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(() => {
        window.__screenSessionTasks = [];
        try {
          new window.PerformanceObserver(list => window.__screenSessionTasks.push(...list.getEntries()
            .map(entry => entry.duration))).observe({type: "longtask", buffered: true});
        } catch { /* Unsupported metric remains empty. */ }
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", {rate: 4});
      await cdp.send("Performance.enable");
      await page.goto(origin, {waitUntil: "domcontentloaded"});
      await page.locator(".publication-card").first().waitFor({timeout: 45_000});
      const focus = page.locator(".screen-homework-focus");
      const trigger = page.getByRole("button", {name: "放大查看", exact: true}).first();
      await trigger.click();
      await focus.getByRole("button", {name: "关闭放大", exact: true}).click();
      await focus.waitFor({state: "hidden"});
      await page.waitForTimeout(1000);
      await cdp.send("HeapProfiler.collectGarbage");
      const before = await snapshot(cdp, page);
      const cycles = [];
      for (let i = 0; i < 10; i++) {
        await trigger.click();
        await focus.waitFor({state: "visible"});
        await focus.getByRole("button", {name: "关闭放大", exact: true}).click();
        await focus.waitFor({state: "hidden"});
        cycles.push(await snapshot(cdp, page));
      }
      const afterCycles = await snapshot(cdp, page);
      await page.waitForTimeout(2000);
      const afterSettle = await snapshot(cdp, page);
      await page.waitForTimeout(28_000);
      const afterIdle = await snapshot(cdp, page);
      await cdp.send("HeapProfiler.collectGarbage");
      const afterGc = await snapshot(cdp, page);
      await cdp.send("Page.setWebLifecycleState", {state: "frozen"});
      await page.waitForTimeout(10_000);
      await cdp.send("Page.setWebLifecycleState", {state: "active"});
      await trigger.click();
      await focus.waitFor({state: "visible"});
      await focus.getByRole("button", {name: "关闭放大", exact: true}).click();
      await focus.waitFor({state: "hidden"});
      await page.waitForTimeout(1000);
      await cdp.send("HeapProfiler.collectGarbage");
      const afterRestore = await snapshot(cdp, page);
      if (errors.length) throw new Error(mode + ": " + errors.join("; "));
      result.modes.push({mode, before, cycles, afterCycles, afterSettle, afterIdle, afterGc,
        lifecycle: {states: ["frozen", "active"], afterRestore}, errors});
      console.log(JSON.stringify({mode, before, afterCycles, afterSettle, afterIdle, afterGc,
        lifecycle: {states: ["frozen", "active"], afterRestore}}));
      await writeFile(new URL("./screen-session-local.json", import.meta.url), JSON.stringify(result, null, 2));
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await client.dispose();
}
