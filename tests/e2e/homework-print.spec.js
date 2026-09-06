import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

const date = "2026-09-06";
async function openBoard(browser, role) {
  const values = {
    "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
    ...(role === "screen" ? {
      "classworks-v2-screen-token": "screen-token",
      "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true}),
    } : {"classworks-v2-student-selection": JSON.stringify({schoolId: "school", administrativeClassId: "class-a",
      administrativeClassName: "高一一班", courseGroupIds: {}, declinedSubjectIds: []})}),
  };
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, serviceWorkers: "allow",
    storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}});
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  await page.getByLabel("选择日期").fill(date);
  return {page, context, errors};
}

async function seed(request, data) {
  const response = await request.post(`${api}/api/v2/publications`, {data: {
    type: "ASSIGNMENT", boardDate: date, publishAt: "2026-01-01T00:00:00Z",
    subjectId: "math", targetWorkspaceIds: ["class-a"], title: "数学练习", ...data,
  }});
  expect(response.ok()).toBe(true);
}

async function preview(page, role) {
  if (role === "screen") {
    await page.getByRole("button", {name: "更多", exact: true}).click();
    await page.getByText("打印作业清单", {exact: true}).click();
  } else {
    await page.getByRole("button", {name: "打印作业清单", exact: true}).click();
  }
  await expect(page.getByText("作业清单预览", {exact: true})).toBeVisible();
  return page.frameLocator('iframe[title="作业清单打印预览"]');
}

test.beforeEach(async ({request}) => {
  expect((await request.post(`${origin}/__test/release`, {data: {release: "previous"}})).ok()).toBe(true);
  expect((await request.post(`${api}/__test/reset`)).ok()).toBe(true);
});

test("student previews selected assignments, prints the same document and paginates long text to PDF", async ({browser, request}, testInfo) => {
  const content = '第一行\n<script>window.injected = true</script>\n' + "完整保留的长作业行\n".repeat(120) + "最后一行";
  await seed(request, {content, dueAt: "2026-09-07T10:00:00Z"});
  await seed(request, {content: "不应打印的通知", type: "NOTICE"});
  await seed(request, {content: "不应打印的其他日期", boardDate: "2026-09-05"});
  const board = await openBoard(browser, "student");
  try {
    const frame = await preview(board.page, "student");
    await expect(frame.locator(".assignment")).toHaveCount(1);
    await expect(frame.locator("header")).toContainText("高一一班");
    await expect(frame.locator("header")).toContainText(date);
    await expect(frame.locator(".content")).toHaveText(content);
    await expect(frame.locator(".details").last()).toContainText("教师已确认");
    await expect(frame.locator("script")).toHaveCount(0);
    const iframe = board.page.frames().find(candidate => candidate.parentFrame());
    await iframe.evaluate(() => { window.printCalls = 0; window.print = () => { window.printCalls++; }; });
    await board.page.getByRole("button", {name: "打印 / 保存 PDF", exact: true}).click();
    expect(await iframe.evaluate(() => window.printCalls)).toBe(1);

    // Render the identical iframe document using Chromium's print engine.
    const document = await board.page.locator(".homework-print-preview").getAttribute("srcdoc");
    const paper = await board.context.newPage();
    await paper.setViewportSize({width: 794, height: 1123});
    await paper.setContent(document);
    await paper.emulateMedia({media: "print"});
    const pdf = await paper.pdf({path: testInfo.outputPath("homework-list.pdf"), preferCSSPageSize: true});
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g).length).toBeGreaterThan(1);
    await paper.screenshot({path: testInfo.outputPath("homework-list.png")});
    await paper.close();
    await board.page.getByRole("button", {name: "关闭", exact: true}).click();
    await expect(board.page.locator(".homework-print-preview")).toHaveCount(0);
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("screen prints a cached board with an explicit offline label", async ({browser, request}) => {
  await seed(request, {content: "离线也可以打印的作业"});
  const board = await openBoard(browser, "screen");
  try {
    await expect(board.page.getByText("离线也可以打印的作业", {exact: true})).toBeVisible();
    await board.context.setOffline(true);
    await board.page.getByRole("button", {name: "刷新", exact: true}).first().click();
    await expect(board.page.getByText("当前无法连接服务器，正在显示这台大屏上次同步的内容")).toBeVisible();
    const frame = await preview(board.page, "screen");
    await expect(frame.locator(".warning")).toContainText("离线缓存内容");
    await expect(frame.locator(".content")).toHaveText("离线也可以打印的作业");
    await board.page.getByRole("button", {name: "关闭", exact: true}).click();
    await preview(board.page, "screen");
    await expect(frame.locator(".assignment")).toHaveCount(1);
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("empty selected day is explicit and changing date does not reuse another day's assignments", async ({browser, request}) => {
  await seed(request, {content: "只属于前一天", boardDate: "2026-09-05"});
  const board = await openBoard(browser, "student");
  try {
    const frame = await preview(board.page, "student");
    await expect(frame.locator(".assignment")).toHaveCount(0);
    await expect(frame.locator("body")).toContainText("没有该日期的作业");
    await board.page.getByRole("button", {name: "关闭", exact: true}).click();
    await board.page.getByLabel("选择日期").fill("2026-09-05");
    await preview(board.page, "student");
    await expect(frame.locator("header")).toContainText("2026-09-05");
    await expect(frame.locator(".content")).toHaveText("只属于前一天");
  } finally { await board.context.close(); }
});
