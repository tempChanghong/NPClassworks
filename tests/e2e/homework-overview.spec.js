import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

async function openBoard(browser, role, serviceWorkers = "allow") {
  const values = {
    "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
    ...(role === "teacher" ? {"classworks-v2-access-token": "teacher-token", "classworks-v2-refresh-token": "teacher-refresh"}
      : role === "screen" ? {"classworks-v2-screen-token": "screen-token", "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true})}
        : {"classworks-v2-student-selection": JSON.stringify({schoolId: "school", administrativeClassId: "class-a",
          administrativeClassName: "高一一班", courseGroupIds: {}, declinedSubjectIds: []})}),
  };
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, serviceWorkers,
    storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  return {page, context, errors};
}
async function seed(request, data) {
  const response = await request.post(`${api}/api/v2/publications`, {data: {
    type: "ASSIGNMENT", boardDate: "2026-09-07", publishAt: "2026-01-01T00:00:00Z", subjectId: "math",
    targetWorkspaceIds: ["class-a"], title: "数学练习", content: "本周的练习", ...data,
  }});
  expect(response.ok()).toBe(true);
  return (await response.json()).data;
}
async function openWeek(page, role) {
  await page.getByLabel("选择日期").fill("2026-09-07");
  if (role === "screen") {
    await page.getByRole("button", {name: "更多", exact: true}).click();
    await page.getByText("一周总览", {exact: true}).click();
  } else await page.getByRole("button", {name: "一周总览", exact: true}).click();
  const dialog = page.locator(".homework-week-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}
test.beforeEach(async ({request}) => {
  expect((await request.post(`${origin}/__test/release`, {data: {release: "previous"}})).ok()).toBe(true);
  expect((await request.post(`${api}/__test/reset`)).ok()).toBe(true);
});

test("real-shaped screen session resolves missing subject names; new homework is silent until edited", async ({browser, request}) => {
  const board = await openBoard(browser, "screen");
  try {
    await board.page.getByLabel("选择日期").fill("2026-09-07");
    await expect(board.page.getByText("数学 · 高一一班：尚未录入", {exact: true})).toBeVisible();
    const session = (await (await request.get(`${api}/api/v2/classroom-screens/session`, {
      headers: {"X-Classworks-Screen-Token": "screen-token"},
    })).json()).data;
    expect(session).not.toHaveProperty("subjects");
    const item = await seed(request, {content: "刚录入的作业"});
    await expect(board.page.getByText("数学 · 高一一班：1 项作业", {exact: true})).toBeVisible();
    await expect(board.page.getByText("刚录入的作业", {exact: true})).toBeVisible();
    const banner = board.page.locator(".screen-homework-changes");
    await expect(banner).toHaveCount(0);
    const response = await request.patch(`${api}/api/v2/publications/${item.id}`, {
      headers: {"If-Match": '"1"'}, data: {content: "老师更正后的作业"},
    });
    expect(response.ok()).toBe(true);
    await expect(banner).toContainText("正文：刚录入的作业 → 老师更正后的作业");
    await expect(banner).toContainText("数学 · 作业更正");
    await board.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => board.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await board.context.setOffline(true);
    await board.page.reload();
    await expect(board.page.getByText("数学 · 高一一班：1 项作业", {exact: true})).toBeVisible();
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("teacher explicitly declares no homework, screen distinguishes missing and warns about later conflicting homework", async ({browser, request}) => {
  const teacher = await openBoard(browser, "teacher"), screen = await openBoard(browser, "screen");
  try {
    await screen.page.getByLabel("选择日期").fill("2026-09-07");
    await expect(screen.page.getByText("数学 · 高一一班：尚未录入", {exact: true})).toBeVisible();
    await teacher.page.locator(".v-select").filter({hasText: "科目"}).first().click();
    await teacher.page.getByRole("option", {name: "数学", exact: true}).click();
    await teacher.page.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
    await teacher.page.getByRole("option", {name: /高一一班/}).click();
    await teacher.page.keyboard.press("Escape");
    await teacher.page.locator(".publication-composer").getByLabel("作业板日期", {exact: true}).fill("2026-09-07");
    const content = teacher.page.getByRole("textbox", {name: "正文 正文", exact: true});
    await content.fill("切换回来不能丢失的输入");
    const toggle = teacher.page.getByRole("checkbox", {name: "该科目在所选日期无作业"});
    await toggle.check();
    await expect(content).toBeDisabled();
    await toggle.uncheck();
    await expect(content).toHaveValue("切换回来不能丢失的输入");
    await toggle.check();
    await teacher.page.getByRole("button", {name: "正式发布", exact: true}).click();
    await expect(screen.page.getByText("数学 · 高一一班：今日无作业", {exact: true})).toBeVisible();
    const state = (await (await request.get(`${api}/__test/state`)).json()).data;
    expect(state.items[0].contentJson).toEqual({kind: "NO_HOMEWORK", version: 1});
    expect(state.items[0].dueAt).toBeNull();
    await seed(request, {content: "后来补充的真实作业"});
    await expect(screen.page.getByText("数学 · 高一一班：作业与无作业标记并存，请核对", {exact: true})).toBeVisible();
    await expect(screen.page.getByText("后来补充的真实作业", {exact: true})).toBeVisible();
    const dialog = await openWeek(screen.page, "screen");
    await expect(dialog.getByText(/同科目作业与无作业标记并存/)).toBeVisible();
    await expect(dialog.getByText("后来补充的真实作业", {exact: true})).toBeVisible();
    expect(teacher.errors).toEqual([]); expect(screen.errors).toEqual([]);
  } finally { await teacher.context.close(); await screen.context.close(); }
});

test("student switches weekly board/deadline views including earlier homework due this week, with missing-backend and offline errors", async ({browser, request}, testInfo) => {
  await seed(request, {content: "本周无截止时间的作业"});
  await seed(request, {boardDate: "2026-09-01", dueAt: "2026-09-06T16:00:00Z", content: "上周布置本周截止"});
  await seed(request, {boardDate: "2026-09-14", dueAt: "2026-09-13T16:00:00Z", content: "下周的作业"});
  const board = await openBoard(browser, "student", "block");
  try {
    const dialog = await openWeek(board.page, "student");
    await expect(dialog.locator(".week-day")).toHaveCount(7);
    await expect(dialog.getByText("本周无截止时间的作业", {exact: true})).toBeVisible();
    await expect(dialog.getByText("上周布置本周截止", {exact: true})).toHaveCount(0);
    await dialog.locator(".v-select").filter({hasText: "查看方式"}).click();
    await board.page.getByRole("option", {name: "按截止日期", exact: true}).click();
    await expect(dialog.locator(".week-day").first()).toContainText("上周布置本周截止");
    await expect(dialog.getByText("本周无截止时间的作业", {exact: true})).toHaveCount(0);
    await expect(dialog.getByText("下周的作业", {exact: true})).toHaveCount(0);
    await board.page.screenshot({path: testInfo.outputPath("homework-week.png")});
    await dialog.getByRole("button", {name: "下一周"}).click();
    await expect(dialog.getByText("下周的作业", {exact: true})).toBeVisible();
    await board.page.route("**/api/v2/publications/feed?**weekStart**", route => route.fulfill({json: {data: {items: []}}}));
    await dialog.getByRole("button", {name: "刷新总览"}).click();
    await expect(dialog.getByText(/后端尚不支持一周总览/)).toBeVisible();
    await expect(dialog.locator(".week-day")).toHaveCount(0);
    await board.page.unroute("**/api/v2/publications/feed?**weekStart**");
    await board.context.setOffline(true);
    await dialog.getByRole("button", {name: "刷新总览"}).click();
    await expect(dialog.locator(".v-alert")).toBeVisible();
    await expect(dialog.locator(".week-day")).toHaveCount(0);
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("changing week cancels a slow old response and closing the dialog clears it", async ({browser}) => {
  const board = await openBoard(browser, "student", "block");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let received;
  const requested = new Promise(resolve => { received = resolve; });
  try {
    await board.page.route("**/api/v2/publications/feed?**weekStart**", async route => {
      const query = new URL(route.request().url()).searchParams;
      if (query.get("weekStart") === "2026-09-07") { received(); await gate; }
      await route.fulfill({json: {data: {weekStart: query.get("weekStart"), weekView: "board", total: 1, items: [{
        id: query.get("weekStart"), boardDate: query.get("weekStart"), type: "ASSIGNMENT", status: "PUBLISHED",
        content: query.get("weekStart") === "2026-09-07" ? "过时的慢响应" : "新一周的数据", subjectId: "math", subject: {name: "数学"}, targets: [],
      }]}}});
    });
    const dialog = await openWeek(board.page, "student");
    await requested;
    await dialog.getByRole("button", {name: "下一周"}).click();
    await expect(dialog.getByText("新一周的数据", {exact: true})).toBeVisible();
    release();
    await expect(dialog.getByText("过时的慢响应", {exact: true})).toHaveCount(0);
    await dialog.getByRole("button", {name: "关闭", exact: true}).click();
    await expect(dialog).not.toBeVisible();
    expect(board.errors).toEqual([]);
  } finally { release(); await board.context.close(); }
});
