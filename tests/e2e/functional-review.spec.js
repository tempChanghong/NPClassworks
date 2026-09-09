import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

async function openRole(browser, role) {
  const values = {
    "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
    "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true}),
    ...(role === "teacher" ? {"classworks-v2-access-token": "teacher-token", "classworks-v2-refresh-token": "teacher-refresh"}
      : {"classworks-v2-screen-token": "screen-token"}),
  };
  const context = await browser.newContext({serviceWorkers: "block", storageState: {cookies: [], origins: [
    {origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))},
  ]}});
  return {context, page: await context.newPage()};
}

test.beforeEach(async ({request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
});

for (const [button, status] of [["保存草稿", "DRAFT"], ["正式发布", "PUBLISHED"]]) {
  test(`${status}: empty publication time is explained, preserves input and allows correction`, async ({browser, request}) => {
    const {context, page} = await openRole(browser, "teacher");
    try {
      await page.goto(origin);
      const composer = page.locator(".publication-composer");
      await composer.locator(".v-select").filter({hasText: "科目"}).click();
      await page.getByRole("option", {name: "数学", exact: true}).click();
      await composer.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
      await page.getByRole("option", {name: /高一一班/}).click();
      await page.keyboard.press("Escape");
      const body = composer.getByRole("textbox", {name: "正文 正文", exact: true});
      await body.fill("时间填错也应保留的作业正文");
      const time = composer.locator('input[type="datetime-local"]').first();
      await time.fill("");
      await composer.getByRole("button", {name: button, exact: true}).click();
      await expect(composer).toContainText("请填写有效的发布时间");
      await expect(body).toHaveValue("时间填错也应保留的作业正文");
      expect((await (await request.get(`${api}/__test/state`)).json()).data.items).toHaveLength(0);
      await time.fill("2026-09-09T08:30");
      const saved = page.waitForResponse(response => response.url() === `${api}/api/v2/publications`
        && response.request().method() === "POST");
      await composer.getByRole("button", {name: button, exact: true}).click();
      const response = await saved;
      expect(response.ok()).toBe(true);
      expect(response.request().postDataJSON().status).toBe(status);
      await expect(body).toHaveValue("");
      const items = (await (await request.get(`${api}/__test/state`)).json()).data.items;
      expect(items).toHaveLength(1);
      expect(items[0].content).toBe("时间填错也应保留的作业正文");
    } finally { await context.close(); }
  });
}

for (const [state, label] of [["absent", "缺勤"], ["late", "迟到"], ["excluded", "不参与"]]) {
  test(`${state}: deleting a student then closing and reopening tools permits attendance saving`, async ({browser}) => {
    const {context, page} = await openRole(browser, "screen");
    let students = [{id: "s1", name: "张三", sortOrder: 0}, {id: "s2", name: "李四", sortOrder: 1}];
    let attendance = {absent: [], late: [], excluded: []};
    let saves = 0;
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.route(`${api}/api/v2/classroom-screens/students`, async route => {
        if (route.request().method() === "PUT") students = route.request().postDataJSON().students;
        await route.fulfill({json: {data: students}});
      });
      await page.route(`${api}/api/v2/classroom-screens/attendance/*`, async route => {
        if (route.request().method() === "PUT") {
          const input = route.request().postDataJSON();
          if (Object.values(input).flat().some(id => !students.some(student => student.id === id))) {
            return route.fulfill({status: 422, json: {code: "ATTENDANCE_STUDENT_INVALID", message: "考勤包含无效学生"}});
          }
          attendance = input;
          saves++;
        }
        await route.fulfill({json: {data: attendance}});
      });
      await page.goto(origin);
      async function openAttendance() {
        await page.getByRole("button", {name: "课堂工具", exact: true}).first().click();
        await page.locator(".tool-entry").filter({hasText: "考勤"}).click();
        await expect(page.locator(".student-row").filter({hasText: "李四"})).toBeVisible();
      }
      await openAttendance();
      await page.locator(".student-row").filter({hasText: "张三"}).getByRole("button", {name: label, exact: true}).click();
      await page.getByRole("button", {name: "保存今日考勤", exact: true}).click();
      await expect.poll(() => saves).toBe(1);
      expect(attendance[state]).toEqual(["s1"]);
      await page.getByRole("button", {name: "编辑学生名单", exact: true}).click();
      await page.getByRole("textbox", {name: "学生名单 学生名单", exact: true}).fill("李四");
      await page.getByRole("button", {name: "保存名单", exact: true}).click();
      await expect(page.locator(".student-row")).toHaveCount(1);
      expect(attendance[state]).toEqual(["s1"]);
      await page.getByTitle("返回课堂工具", {exact: true}).click();
      await page.getByTitle("关闭", {exact: true}).click();
      await openAttendance();
      const tools = page.locator(".classroom-tools-container");
      await expect(tools).toContainText("到校 1");
      for (const text of ["缺勤 0", "迟到 0", "不参与 0"]) await expect(tools).toContainText(text);
      await page.getByRole("button", {name: "保存今日考勤", exact: true}).click();
      await expect.poll(() => saves).toBe(2);
      expect(attendance).toEqual({absent: [], late: [], excluded: []});
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
