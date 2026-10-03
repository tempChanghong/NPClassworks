import {chromium, request} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {api, origin} from "../../tests/e2e/environment.js";

const output = new URL("./role-load-local.json", import.meta.url);
const boardDate = new Date().toLocaleDateString("sv-SE", {timeZone: "Asia/Shanghai"});
const client = await request.newContext();
const reset = await client.post(`${api}/__test/reset`);
if (!reset.ok()) throw new Error("Local E2E backend is unavailable");
for (let index = 0; index < 12; index++) {
  const response = await client.post(`${api}/api/v2/publications`, {data: {
    boardDate, subjectId: "math", title: `数学练习 ${index + 1}`,
    content: `完成课堂练习 ${index + 1}，写出主要步骤并订正错误。`.repeat(3),
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    publishAt: new Date(Date.now() - 3_600_000).toISOString(),
  }});
  if (!response.ok()) throw new Error(`Unable to seed publication ${index + 1}`);
}

function storedRole(role) {
  const values = {
    "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
    ...(role === "student" ? {"classworks-v2-student-selection": JSON.stringify({
      schoolId: "school", administrativeClassId: "class-a", administrativeClassName: "高一一班",
      courseGroupIds: {}, declinedSubjectIds: [],
    })} : {}),
    ...(role === "teacher" ? {"classworks-v2-access-token": "teacher-token",
      "classworks-v2-refresh-token": "teacher-refresh"} : {}),
    ...(role === "screen" ? {"classworks-v2-screen-token": "screen-token",
      "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true})} : {}),
  };
  return {cookies: [], origins: [{origin, localStorage: Object.entries(values)
    .map(([name, value]) => ({name, value}))}]};
}

const cases = [
  {role: "student", width: 390, height: 844, touch: true, ready: ".publication-card"},
  {role: "teacher", width: 1440, height: 1000, touch: false, ready: ".teacher-session-summary"},
  {role: "screen", width: 1920, height: 1080, touch: true, ready: ".publication-card"},
];
const browser = await chromium.launch({headless: true});
const runs = [];
async function newPage(spec, serviceWorkers) {
  const context = await browser.newContext({viewport: {width: spec.width, height: spec.height},
    hasTouch: spec.touch, isMobile: spec.role === "student", timezoneId: "Asia/Shanghai",
    serviceWorkers, storageState: storedRole(spec.role)});
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__uiLoadTasks = [];
    window.__uiLoadLcp = 0;
    try {
      new window.PerformanceObserver(list => {
        window.__uiLoadTasks.push(...list.getEntries().map(entry => entry.duration));
      }).observe({type: "longtask", buffered: true});
      new window.PerformanceObserver(list => {
        window.__uiLoadLcp = list.getEntries().at(-1)?.startTime || 0;
      }).observe({type: "largest-contentful-paint", buffered: true});
    } catch { /* Unsupported metrics remain null. */ }
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", {rate: 4});
  return {context, page, cdp};
}

async function navigate(page, spec, cache, iteration) {
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on("pageerror", onError);
  await page.goto(origin, {waitUntil: "domcontentloaded", timeout: 45_000});
  await page.locator(spec.ready).first().waitFor({timeout: 45_000});
  const visibleMs = await page.evaluate(() => window.performance.now());
  await page.evaluate(() => window.document.fonts.ready);
  await page.waitForTimeout(900);
  const metrics = await page.evaluate(() => {
    const navigation = window.performance.getEntriesByType("navigation")[0];
    const resources = window.performance.getEntriesByType("resource")
      .filter(entry => new URL(entry.name).origin === window.location.origin);
    const longTasks = window.__uiLoadTasks || [];
    return {
      domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
      loadMs: Math.round(navigation.loadEventEnd),
      fcpMs: Math.round(window.performance.getEntriesByName("first-contentful-paint")[0]?.startTime || 0),
      lcpMs: Math.round(window.__uiLoadLcp || 0),
      resourceCount: resources.length,
      staticTransferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
      largestTransfers: resources.map(entry => ({path: new URL(entry.name).pathname,
        bytes: entry.transferSize})).sort((a, b) => b.bytes - a.bytes).slice(0, 10),
      longTaskCount: longTasks.length,
      longTaskTotalMs: Math.round(longTasks.reduce((sum, duration) => sum + duration, 0)),
      heapUsedMb: window.performance.memory
        ? Math.round(window.performance.memory.usedJSHeapSize / 1048576) : null,
      serviceWorkerControlled: Boolean(window.navigator.serviceWorker?.controller),
    };
  });
  page.off("pageerror", onError);
  const result = {role: spec.role, cache, iteration, visibleMs: Math.round(visibleMs), errors, ...metrics};
  runs.push(result);
  console.log(JSON.stringify(result));
  if (errors.length) throw new Error(`${spec.role} ${cache} produced page errors`);
}

try {
  for (const spec of cases) {
    for (let iteration = 1; iteration <= 3; iteration++) {
      const {context, page} = await newPage(spec, "block");
      try { await navigate(page, spec, "cold-no-sw", iteration); }
      finally { await context.close(); }
    }
    const {context, page} = await newPage(spec, "allow");
    try {
      await page.goto(origin, {waitUntil: "domcontentloaded"});
      await page.evaluate(() => window.navigator.serviceWorker.ready);
      await page.waitForFunction(() => Boolean(window.navigator.serviceWorker.controller), null, {timeout: 45_000});
      for (let iteration = 1; iteration <= 3; iteration++) {
        await navigate(page, spec, "installed-pwa", iteration);
      }
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await client.dispose();
  await writeFile(output, JSON.stringify({at: new Date().toISOString(), browser: browser.version(),
    machine: process.platform, cpuThrottle: 4, network: "loopback", publications: 12,
    scenarios: cases.map(spec => ({role: spec.role, width: spec.width,
      height: spec.height, touch: spec.touch})), runs}, null, 2));
}
