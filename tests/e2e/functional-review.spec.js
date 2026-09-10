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

test("offline unfavorite survives browser reload and preserves another device's addition", async ({browser}) => {
  const {context, page} = await openRole(browser, "teacher");
  const favorite = {type: "ASSIGNMENT", subjectId: "math", targetWorkspaceIds: ["class-a"], savedAt: "2026-09-10T00:00:00Z"};
  const otherFavorite = {type: "NOTICE", subjectId: null, targetWorkspaceIds: ["class-a"], savedAt: "2026-09-10T01:00:00.000Z"};
  let remote = {favorites: [favorite], recent: []}, unavailable = false, failedRequests = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.route(`${api}/accounts/preferences/teacher-targets`, async route => {
      if (unavailable) { failedRequests++; return route.abort("internetdisconnected"); }
      if (route.request().method() === "PUT") remote = route.request().postDataJSON().preferences;
      return route.fulfill({json: {data: {preferences: remote}}});
    });
    await page.goto(origin);
    const composer = page.locator(".publication-composer");
    const selectMath = async () => {
      await composer.locator(".v-select").filter({hasText: "科目"}).click();
      await page.getByRole("option", {name: "数学", exact: true}).click();
      await composer.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
      await page.getByRole("option", {name: /高一一班/}).click();
      await page.keyboard.press("Escape");
    };
    await selectMath();
    unavailable = true;
    await composer.getByRole("button", {name: "取消收藏当前目标", exact: true}).click();
    await expect.poll(() => failedRequests).toBeGreaterThan(0);
    await expect(composer.getByRole("button", {name: "收藏当前目标组合", exact: true})).toBeVisible();
    // Reload with the preference endpoint still offline: the local removal is durable.
    await page.reload();
    await selectMath();
    await expect(composer.getByRole("button", {name: "收藏当前目标组合", exact: true})).toBeVisible();
    remote.favorites.push(otherFavorite);
    unavailable = false;
    await page.reload();
    await selectMath();
    await expect(composer.getByRole("button", {name: "收藏当前目标组合", exact: true})).toBeVisible();
    await expect.poll(() => remote.favorites).toEqual([otherFavorite]);
    await composer.getByRole("button", {name: "通知", exact: true}).click();
    await expect(composer.getByRole("button", {name: "取消收藏当前目标", exact: true})).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("attendance read failure and a pending retry cannot overwrite a cached saved record", async ({browser}) => {
  const {context, page} = await openRole(browser, "screen");
  let fail = false, saves = 0, release = () => {};
  let pendingRead = null;
  const saved = {absent: ["s1"], late: [], excluded: []};
  try {
    await page.route(`${api}/api/v2/classroom-screens/students`, r => r.fulfill({json: {data: [{id: "s1", name: "张三", sortOrder: 0}]}}));
    await page.route(`${api}/api/v2/classroom-screens/attendance/*`, async route => {
      if (route.request().method() === "PUT") {
        saves++;
        expect(route.request().postDataJSON()).toEqual(saved);
      } else {
        if (fail) return route.fulfill({status: 503, json: {message: "考勤读取暂时失败"}});
        if (pendingRead) await pendingRead;
      }
      await route.fulfill({json: {data: saved}});
    });
    await page.goto(origin);
    const open = async () => {
      await page.getByRole("button", {name: "课堂工具", exact: true}).first().click();
      await page.locator(".tool-entry").filter({hasText: "考勤"}).click();
    };
    await open();
    await expect(page.locator(".classroom-tools-container")).toContainText("缺勤 1");
    await page.getByTitle("返回课堂工具", {exact: true}).click();
    await page.getByTitle("关闭", {exact: true}).click();
    fail = true;
    await open();
    const save = page.getByRole("button", {name: "保存今日考勤", exact: true});
    await expect(page.getByText("考勤读取暂时失败", {exact: true})).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(page.locator(".student-row")).toHaveCount(0);
    expect(saves).toBe(0);
    fail = false;
    pendingRead = new Promise(resolve => { release = resolve; });
    await page.getByRole("button", {name: "重新读取考勤"}).click();
    await expect(page.getByText("正在读取今日考勤，完成前不能编辑或保存。", {exact: false})).toBeVisible();
    await expect(save).toBeDisabled();
    release();
    await expect(save).toBeEnabled();
    await expect(page.locator(".classroom-tools-container")).toContainText("缺勤 1");
    await save.click();
    await expect.poll(() => saves).toBe(1);
  } finally { release(); await context.close(); }
});

for (const switchEditor of [false, true]) {
  test(`teacher delayed save preserves ${switchEditor ? "another publication's" : "the same publication's"} later input`, async ({browser, request}) => {
    for (const title of ["隔离测试A", "隔离测试B"]) {
      await request.post(`${api}/api/v2/publications`, {data: {type: "ASSIGNMENT", subjectId: "math", targetWorkspaceIds: ["class-a"],
        title, content: `${title}正文`, status: "PUBLISHED", priority: "NORMAL"}});
    }
    const {context, page} = await openRole(browser, "teacher");
    let release = () => {}, started = false;
    const gate = new Promise(resolve => { release = resolve; });
    try {
      await page.route(`${api}/api/v2/publications/pub-1`, async route => {
        if (route.request().method() === "PATCH" && !started) {
          started = true;
          await gate;
        }
        await route.continue();
      });
      await page.goto(origin);
      const composer = page.locator(".publication-composer");
      const body = composer.getByRole("textbox", {name: "正文 正文", exact: true});
      const edit = async title => {
        await page.locator(".publication-list-item").filter({hasText: title}).getByRole("button").last().click();
        await page.getByText("编辑", {exact: true}).click();
        await expect(body).toHaveValue(`${title}正文`);
      };
      await edit("隔离测试A");
      await body.fill("A本次提交");
      await composer.getByRole("button", {name: "保存修改", exact: true}).click();
      await expect.poll(() => started).toBe(true);
      if (switchEditor) await edit("隔离测试B");
      await body.fill("之后输入，仍需保存");
      release();
      await expect(composer.getByRole("button", {name: "保存修改", exact: true})).toBeEnabled();
      await expect(body).toHaveValue("之后输入，仍需保存");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      let items = (await (await request.get(`${api}/__test/state`)).json()).data.items;
      expect(items[0].content).toBe("A本次提交");
      expect(items[1].content).toBe("隔离测试B正文");
      await page.getByRole("button", {name: "知道了", exact: true}).click();
      await composer.getByRole("button", {name: "保存修改", exact: true}).click();
      await expect.poll(async () => {
        items = (await (await request.get(`${api}/__test/state`)).json()).data.items;
        return items[switchEditor ? 1 : 0].content;
      }).toBe("之后输入，仍需保存");
      expect(items[switchEditor ? 1 : 0].revision).toBe(switchEditor ? 2 : 3);
    } finally { release(); await context.close(); }
  });
}

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
