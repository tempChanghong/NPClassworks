import {test, expect} from "@playwright/test";
import {api, origin} from "./environment.js";

async function screen(browser) {
  const values = {"classworks-v2-screen-token": "screen-token", "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: "screen"}),
    "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true})};
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, serviceWorkers: "allow", timezoneId: "Asia/Shanghai",
    storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin);
  await expect(page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
  return {context, page, errors};
}
const today = () => new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Shanghai"}).format(new Date());
async function publish(request, input) {
  const response = await request.post(`${api}/api/v2/publications`, {data: {type: "ASSIGNMENT", boardDate: today(), ...input}});
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}
async function openCopy(page) {
  await page.getByTitle("更多", {exact: true}).click();
  await page.getByText("抄写模式", {exact: true}).click();
  await expect(page.locator(".screen-copy-mode")).toBeVisible();
}
test.beforeEach(async ({request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
});

test("copy mode shows full long homework with overlapping pages and first opens offline from PWA cache", async ({browser, request}) => {
  const content = Array.from({length: 30}, (_, i) => `第${i + 1}行完整练习说明，请认真完成并检查答案。`).join("\n");
  await publish(request, {title: "长作业", content});
  await publish(request, {title: "下一项", content: "第二份完整作业"});
  await publish(request, {title: "不属于今日的作业", content: "旧日期内容", boardDate: "2000-01-01"});
  const s = await screen(browser);
  try {
    await expect(s.page.getByText("长作业", {exact: true}).first()).toBeVisible();
    await s.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => s.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await s.context.setOffline(true);
    await openCopy(s.page);
    const mode = s.page.locator(".screen-copy-mode"), scroll = mode.locator(".copy-scroll");
    await expect(mode.locator(".copy-content")).toHaveText(content);
    await expect(mode).toContainText("第 1 / 2 项");
    await expect(mode).toContainText("可能不是最新作业");
    const dimensions = () => scroll.evaluate(el => ({top: el.scrollTop, height: el.clientHeight, total: el.scrollHeight}));
    let previous = await dimensions();
    expect(previous.total).toBeGreaterThan(previous.height * 2);
    for (let i = 0; previous.top < previous.total - previous.height - 2 && i < 30; i++) {
      await mode.getByRole("button", {name: "下一屏", exact: true}).click();
      const now = await dimensions();
      expect(now.top).toBeGreaterThan(previous.top);
      expect(now.top - previous.top).toBeLessThan(previous.height);
      previous = now;
    }
    expect(previous.top).toBeCloseTo(previous.total - previous.height, 0);
    await mode.getByRole("button", {name: "下一屏", exact: true}).click();
    await expect(mode).toContainText("第二份完整作业");
    await mode.getByRole("button", {name: "上一屏", exact: true}).click();
    await expect(mode.locator(".copy-content")).toHaveText(content);
    await mode.getByRole("button", {name: "退出抄写模式", exact: true}).click();
    await expect(mode).not.toBeVisible();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("withdrawn homework leaves copying mode immediately without retaining its content", async ({browser, request}) => {
  const row = await publish(request, {title: "准备撤回", content: "不可继续抄写的内容"});
  const s = await screen(browser);
  try {
    await openCopy(s.page);
    const mode = s.page.locator(".screen-copy-mode");
    await mode.getByRole("button", {name: "开始轮播", exact: true}).click();
    expect((await request.patch(`${api}/api/v2/publications/${row.id}`, {headers: {"If-Match": '"1"'}, data: {status: "WITHDRAWN"}})).ok()).toBe(true);
    await expect(mode).not.toBeVisible();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("copy rotation pauses for notices/background and resets on corrections", async ({browser, request}) => {
  const first = await publish(request, {title: "第一项", content: "第一份作业"});
  await publish(request, {title: "第二项", content: "第二份作业"});
  const s = await screen(browser);
  try {
    await openCopy(s.page);
    const mode = s.page.locator(".screen-copy-mode");
    await s.page.clock.install();
    await mode.getByRole("button", {name: "开始轮播", exact: true}).click();
    await s.page.clock.runFor(31000);
    await expect(mode).toContainText("第二份作业");
    await publish(request, {type: "NOTICE", title: "临时通知", content: "请先阅读通知", priority: "NORMAL"});
    await s.page.clock.runFor(1000);
    const notice = s.page.locator(".screen-notice-popup");
    await expect(notice).toBeVisible();
    await s.page.clock.runFor(60000);
    await expect(mode).toContainText("第二份作业");
    await notice.getByRole("button", {name: "知道了", exact: true}).click();
    await expect(notice).not.toBeVisible();
    await s.page.clock.runFor(29000);
    await expect(mode).toContainText("第二份作业");
    await s.page.clock.runFor(2000);
    await expect(mode).toContainText("第一份作业");
    await s.page.evaluate(() => { Object.defineProperty(document, "hidden", {configurable: true, value: true}); document.dispatchEvent(new window.Event("visibilitychange")); });
    await s.page.clock.runFor(60000);
    await expect(mode).toContainText("第一份作业");
    await s.page.evaluate(() => { delete document.hidden; document.dispatchEvent(new window.Event("visibilitychange")); });
    await s.page.clock.runFor(31000);
    await expect(mode).toContainText("第二份作业");
    const update = await request.patch(`${api}/api/v2/publications/${first.id}`, {headers: {"If-Match": '"1"'}, data: {content: "更正后的第一份"}});
    expect(update.ok()).toBe(true);
    await s.page.clock.runFor(1000);
    await expect(mode.getByRole("button", {name: "开始轮播", exact: true})).toBeVisible();
    await expect(mode).toContainText("作业内容有变化");
    await mode.getByRole("button", {name: "退出抄写模式", exact: true}).click();
    await expect(mode).not.toBeVisible();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});
