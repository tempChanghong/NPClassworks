import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

async function screenBrowser(browser) {
  const context = await browser.newContext({timezoneId: "Asia/Shanghai", serviceWorkers: "block", storageState: {
    cookies: [], origins: [{origin, localStorage: [
      {name: "classworks-v2-screen-token", value: "screen-token"},
      {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "screen"})},
      {name: "classworks-v2-screen-oobe:screen-a", value: JSON.stringify({version: 1, completed: true})},
    ]}],
  }});
  await context.route(`${api}/api/v2/classroom-screens/unlock`, r => r.fulfill({json: {data: {unlocked: true}}}));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  return {context, page, errors};
}

async function unlock(page) {
  await page.getByRole("button", {name: "更多", exact: true}).click();
  await page.getByText("临时退出大屏", {exact: true}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("本大屏 PIN", {exact: false}).fill("1234");
  await dialog.getByRole("button", {name: "验证并退出"}).click();
  await expect(page.locator(".screen-temporary-unlock")).toBeVisible();
}

test.beforeEach(async ({request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
});

test("temporary screen exit expires across settings and clears teacher credentials while preserving binding", async ({browser}) => {
  const s = await screenBrowser(browser);
  try {
    await s.page.clock.install({time: new Date("2026-09-08T12:00:00+08:00")});
    await s.page.goto(origin);
    await unlock(s.page);
    await s.page.evaluate(() => {
      localStorage.setItem("classworks-v2-access-token", "teacher-token");
      localStorage.setItem("classworks-v2-refresh-token", "teacher-refresh");
    });
    await s.page.getByRole("button", {name: "设置", exact: true}).click();
    await expect(s.page).toHaveURL(/\/settings/);
    await s.page.clock.fastForward(16 * 60 * 1000);
    await expect(s.page).toHaveURL(`${origin}/`);
    await expect(s.page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
    expect(await s.page.evaluate(() => [localStorage.getItem("classworks-v2-access-token"),
      localStorage.getItem("classworks-v2-refresh-token"), localStorage.getItem("classworks-v2-screen-token")])).toEqual([null, null, "screen-token"]);
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("date navigation updates at midnight and after sleep without changing the selected historical date", async ({browser}) => {
  const s = await screenBrowser(browser);
  try {
    await s.page.clock.install({time: new Date("2026-09-08T23:59:58+08:00")});
    await s.page.goto(origin);
    const nav = s.page.locator(".board-date-navigator");
    await expect(nav.getByText("今天", {exact: true})).toBeVisible();
    await s.page.clock.fastForward(5000);
    await expect(nav.getByText("昨天", {exact: true})).toBeVisible();
    await expect(nav.getByLabel("选择日期")).toHaveValue("2026-09-08");
    await nav.getByRole("button", {name: "回到今天", exact: true}).click();
    await expect(nav.getByLabel("选择日期")).toHaveValue("2026-09-09");
    await nav.getByLabel("选择日期").fill("2026-09-07");
    await s.page.clock.setSystemTime(new Date("2026-09-11T08:00:00+08:00"));
    await s.page.evaluate(() => window.dispatchEvent(new window.PageTransitionEvent("pageshow", {persisted: true})));
    await expect(nav.getByLabel("选择日期")).toHaveValue("2026-09-07");
    await nav.getByRole("button", {name: "回到今天", exact: true}).click();
    await expect(nav.getByLabel("选择日期")).toHaveValue("2026-09-11");
    await expect(nav.getByText("今天", {exact: true})).toBeVisible();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("manual return locks other tabs, blocks direct management access and preserves screen settings", async ({browser}) => {
  const s = await screenBrowser(browser);
  try {
    await s.page.goto(origin); await unlock(s.page);
    await s.page.evaluate(() => {
      localStorage.setItem("classworks-v2-access-token", "teacher-token");
      localStorage.setItem("classworks-v2-refresh-token", "teacher-refresh");
    });
    const other = await s.context.newPage();
    await other.goto(origin);
    await expect(other.locator(".screen-temporary-unlock")).toBeVisible();
    await s.page.getByRole("button", {name: "立即返回大屏"}).click();
    await expect(s.page.locator(".screen-temporary-unlock")).not.toBeVisible();
    await expect(other.locator(".screen-temporary-unlock")).not.toBeVisible();
    await expect(other.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
    expect(await other.evaluate(() => localStorage.getItem("classworks-v2-access-token"))).toBeNull();
    await other.goto(`${origin}/classworks-admin`);
    await expect(other).toHaveURL(`${origin}/`);
    await other.getByRole("button", {name: "显示设置", exact: true}).first().click();
    await expect(other).toHaveURL(/\/settings/);
    await expect(other.getByText("NPClassworks 设置中心", {exact: true})).toBeVisible();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("refresh ends temporary access and sleep expiry dismisses unsaved management confirmation", async ({browser}) => {
  const s = await screenBrowser(browser);
  const school = {id: "school", code: "E2E", name: "测试学校", terms: [{id: "term", name: "当前学期", status: "ACTIVE"}]};
  await s.context.route(`${api}/accounts/local/status`, r => r.fulfill({json: {data: {bootstrapRequired: false}}}));
  await s.context.route(`${api}/api/v2/me/schools?**`, r => r.fulfill({json: {data: [{role: "OWNER", school}]}}));
  await s.context.route(`${api}/api/v2/admin/**`, r => {
    const path = new URL(r.request().url()).pathname;
    const data = path.endsWith("/staff-responsibilities") ? {policy: {}, people: [], grades: [], administrativeClasses: []}
      : path.endsWith("/workspace-memberships") ? {workspaces: []} : [];
    return r.fulfill({json: {data}});
  });
  const loginTokens = () => s.page.evaluate(() => {
    localStorage.setItem("classworks-v2-access-token", "teacher-token");
    localStorage.setItem("classworks-v2-refresh-token", "teacher-refresh");
  });
  try {
    await s.page.goto(origin); await unlock(s.page); await loginTokens();
    await s.page.goto(`${origin}/settings`);
    await expect(s.page.getByText("NPClassworks 设置中心", {exact: true})).toBeVisible();
    await s.page.reload();
    await expect(s.page).toHaveURL(`${origin}/`);
    expect(await s.page.evaluate(() => localStorage.getItem("classworks-v2-access-token"))).toBeNull();
    // Install the sleep clock after the real reload: Playwright's clock intentionally removes navigation entries.
    await s.page.clock.install({time: new Date("2026-09-08T12:00:00+08:00")});
    await s.page.goto(origin); await unlock(s.page); await loginTokens();
    await s.page.goto(`${origin}/classworks-admin?section=accounts&school=school&term=term`);
    await s.page.getByLabel("管理员短账号", {exact: true}).fill("unfinished-admin");
    await s.page.getByRole("button", {name: "返回教师工作台"}).click();
    await expect(s.page.getByRole("dialog")).toContainText("放弃未保存的修改？");
    await s.page.clock.setSystemTime(new Date("2026-09-08T12:16:00+08:00"));
    await s.page.evaluate(() => window.dispatchEvent(new window.PageTransitionEvent("pageshow", {persisted: true})));
    await expect(s.page).toHaveURL(`${origin}/`);
    await expect(s.page.getByRole("dialog")).not.toBeVisible();
    await expect(s.page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
    expect(await s.page.evaluate(() => localStorage.getItem("classworks-v2-refresh-token"))).toBeNull();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("a stale screen binding does not loop between setup and home on an uninitialized instance", async ({browser}) => {
  const s = await screenBrowser(browser);
  let checks = 0;
  await s.context.route(`${api}/api/v2/setup/status`, r => {
    checks++; return r.fulfill({json: {data: {state: "NEW", canStart: true}}});
  });
  try {
    await s.page.goto(origin);
    await expect(s.page).toHaveURL(/\/setup/);
    await expect(s.page.locator(".v-application").first()).toBeVisible();
    expect(checks).toBeLessThan(5);
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});
