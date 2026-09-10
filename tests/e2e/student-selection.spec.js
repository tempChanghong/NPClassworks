import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

const selectionKey = "classworks-v2-student-selection";
// Let Playwright own teardown so a timeout keeps the original failing action.
test.use({serviceWorkers: "block", storageState: {cookies: [], origins: [{origin, localStorage: [
    {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "student"})},
    {name: selectionKey, value: JSON.stringify({schoolId: "school", administrativeClassId: "class-a",
      administrativeClassName: "高一一班", courseGroupIds: {physics: "old-group"}, declinedSubjectIds: []})},
]}]}});

async function openStudent(context, page, stoppedInitially) {
  let stopped = stoppedInitially;
  let stopOnValidation = false;
  const feeds = [], submissions = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const options = () => ({administrativeClass: {id: "class-a", name: "高一一班"}, subjects: [
    {subject: {id: "physics", name: "物理"}, deliveryMode: "COURSE_GROUP", requiresCourseGroupSelection: true,
      isCompulsory: true, courseGroups: [{id: stopped ? "replacement" : "old-group", name: stopped ? "物理新班" : "物理旧班"}]},
  ]});
  await context.route(`${api}/api/v2/catalog/administrative-classes/class-a/course-options`, r => r.fulfill({json: {data: options()}}));
  await context.route(`${api}/api/v2/catalog/administrative-classes/class-a/student-selection/validate`, r => {
    const data = r.request().postDataJSON();
    if (stopOnValidation) { stopped = true; stopOnValidation = false; }
    submissions.push(data);
    const accepted = data.courseGroupIds.physics === (stopped ? "replacement" : "old-group");
    return r.fulfill(accepted ? {json: {data: {normalized: data, issues: [], confirmedAt: new Date().toISOString()}}}
      : {status: 422, json: {code: "STUDENT_SELECTION_INVALID", message: "所选教学班已停用，请重新选择",
        data: {issues: [{subjectId: "physics", severity: "ERROR", code: "COURSE_GROUP_NOT_AVAILABLE", message: "请重新选择物理走班"}]}}});
  });
  await context.route(`${api}/api/v2/publications/feed?**`, r => {
    const query = new URL(r.request().url()).searchParams;
    const ids = query.get("workspaceIds").split(","); feeds.push(ids);
    return r.fulfill(stopped && ids.includes("old-group")
      ? {status: 404, json: {code: "WORKSPACE_NOT_FOUND", message: "部分目标已停用"}}
      : {json: {data: {items: [{id: "homework", type: "ASSIGNMENT", status: "PUBLISHED", revision: 1,
        boardDate: query.get("boardDate"), publishAt: new Date().toISOString(), isCertified: true,
        content: "行政班作业保持可见", subject: {id: "math", name: "数学"}, subjectId: "math",
        targets: [{workspace: {id: "class-a", name: "高一一班", type: "ADMIN_CLASS"}}]}], generatedAt: new Date().toISOString()}}});
  });
  await page.goto(origin);
  return {context, page, feeds, submissions, errors, stop: () => { stopped = true; },
    stopOnNextValidation: () => { stopOnValidation = true; }};
}

test.beforeEach(async ({request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
});

test("a selected streamed subject displays missing, assigned, no-homework and conflict states", async ({context, page}) => {
  await context.route(`${api}/api/v2/catalog/subjects?**`, r => r.fulfill({json: {data: [{id: "math", name: "数学"}, {id: "physics", name: "物理"}]}}));
  const s = await openStudent(context, page, false);
  const status = page.locator(".v-chip").filter({hasText: /^物理 · 物理旧班：/});
  await expect(status).toHaveText("物理 · 物理旧班：尚未录入");
  let items = [];
  await context.route(`${api}/api/v2/publications/feed?**`, route => {
    const date = new URL(route.request().url()).searchParams.get("boardDate");
    return route.fulfill({json: {data: {items: items.map(item => ({...item, boardDate: date})), generatedAt: new Date().toISOString()}}});
  });
  const work = {id: "physics-work", type: "ASSIGNMENT", status: "PUBLISHED", subjectId: "physics", revision: 1,
    subject: {id: "physics", name: "物理"}, content: "走班练习", publishAt: new Date().toISOString(), isCertified: true,
    targets: [{workspaceId: "old-group", workspace: {id: "old-group", name: "物理旧班", type: "COURSE_GROUP", subjectId: "physics"}}]};
  const marker = {...work, id: "physics-none", title: "今日无作业", content: "本日该科目无作业。", contentJson: {kind: "NO_HOMEWORK", version: 1}};
  for (const [next, label] of [[[work], "1 项作业"], [[marker], "今日无作业"], [[work, marker], "作业与无作业标记并存，请核对"]]) {
    items = next;
    await page.getByRole("button", {name: "刷新", exact: true}).first().click();
    await expect(status).toHaveText(`物理 · 物理旧班：${label}`);
  }
  expect(s.errors).toEqual([]);
});

test("persisted stopped groups are removed on reload and replacement selection works through real controls", async ({context, page}) => {
  const s = await openStudent(context, page, true);
  await expect(s.page.getByText("行政班作业保持可见", {exact: true})).toBeVisible();
  await expect(s.page.getByText("请重新确认走班选择：", {exact: false})).toBeVisible();
  await s.page.getByRole("button", {name: "修改选班"}).click();
  const dialog = s.page.getByRole("dialog");
  await expect(dialog.getByText("选择我的班级", {exact: false})).toBeVisible();
  const save = dialog.getByRole("button", {name: "保存并查看作业"});
  await expect(save).toBeDisabled();
  expect(s.feeds.every(ids => !ids.includes("old-group"))).toBe(true);
  await dialog.locator(".v-select").filter({hasText: "物理（必须确认）"}).locator(".v-field").click();
  await expect(s.page.getByRole("option", {name: "物理旧班"})).toHaveCount(0);
  await s.page.getByRole("option", {name: "物理新班"}).click();
  await save.click();
  await expect(dialog).not.toBeVisible();
  await expect(s.page.getByText("行政班作业保持可见", {exact: true})).toBeVisible();
  await s.page.reload();
  await expect(s.page.getByText("行政班作业保持可见", {exact: true})).toBeVisible();
  await expect(s.page.getByRole("dialog")).not.toBeVisible();
  expect(await s.page.evaluate(key => JSON.parse(localStorage.getItem(key)).courseGroupIds, selectionKey)).toEqual({physics: "replacement"});
  expect(s.errors).toEqual([]);
});

test("an open selector refreshes choices rejected at submission despite a background refresh before clicking", async ({context, page, request}) => {
  const s = await openStudent(context, page, false);
  await expect(s.page.getByText("行政班作业保持可见", {exact: true})).toBeVisible();
  await s.page.getByRole("button", {name: "修改选班"}).click();
  const dialog = s.page.getByRole("dialog"), save = dialog.getByRole("button", {name: "保存并查看作业"});
  await expect(save).toBeEnabled();
  // Stop at the validation request boundary. Stopping earlier lets the initial
  // Socket refresh recover the feed and disable this button before the click.
  s.stopOnNextValidation();
  const before = s.feeds.length;
  await request.post(`${api}/__test/invalidation-burst`);
  await expect.poll(() => s.feeds.length).toBeGreaterThan(before);
  await expect(save).toBeEnabled();
  await Promise.all([
    s.page.waitForResponse(response => response.url().endsWith("/student-selection/validate") && response.status() === 422, {timeout: 10000}),
    save.click({timeout: 10000}),
  ]);
  expect(s.submissions.at(-1).courseGroupIds).toEqual({physics: "old-group"});
  await expect(dialog.getByText("所选教学班已停用，请重新选择", {exact: true})).toBeVisible();
  await expect(save).toBeDisabled();
  await dialog.locator(".v-select").filter({hasText: "物理（必须确认）"}).locator(".v-field").click();
  await expect(s.page.getByRole("option", {name: "物理旧班"})).toHaveCount(0);
  await expect(s.page.getByRole("option", {name: "物理新班"})).toBeVisible();
  await s.page.keyboard.press("Escape");
  await expect(s.page.getByRole("option", {name: "物理新班"})).not.toBeVisible();
  await dialog.locator(".v-card-title").getByRole("button").click();
  await expect(dialog).not.toBeVisible();
  expect(s.errors).toEqual([]);
});

test("realtime recovery disables stale open selection and keeps the active board and manual refresh usable", async ({context, page, request}) => {
  const s = await openStudent(context, page, false);
  await expect(s.page.getByText("行政班作业保持可见", {exact: true})).toBeVisible();
  await s.page.getByRole("button", {name: "修改选班"}).click();
  const dialog = s.page.getByRole("dialog"), save = dialog.getByRole("button", {name: "保存并查看作业"});
  await expect(save).toBeEnabled();
  const before = s.feeds.length;
  const submissions = s.submissions.length;
  s.stop();
  await request.post(`${api}/__test/invalidation-burst`);
  await expect(dialog).toBeVisible();
  // Both reconnect and invalidation may request a refresh. Assert the recovery
  // sequence without requiring an exact count of legitimate extra requests.
  await expect.poll(() => {
    const feeds = s.feeds.slice(before);
    const rejected = feeds.findIndex(ids => ids.includes("old-group"));
    return rejected >= 0 && feeds.slice(rejected + 1).some(ids => ids.length === 1 && ids[0] === "class-a");
  }).toBe(true);
  await expect(save).toBeDisabled();
  expect(s.submissions).toHaveLength(submissions);
  expect(await s.page.evaluate(key => JSON.parse(localStorage.getItem(key)).courseGroupIds, selectionKey)).toEqual({});
  await dialog.locator(".v-card-title").getByRole("button").click();
  await expect(dialog).not.toBeVisible();
  const recovered = s.feeds.length;
  await s.page.getByRole("button", {name: "刷新", exact: true}).first().click();
  await expect.poll(() => s.feeds.length).toBeGreaterThan(recovered);
  expect(s.feeds.slice(recovered).every(ids => !ids.includes("old-group"))).toBe(true);
  await expect(s.page.getByText("行政班作业保持可见", {exact: true})).toBeVisible();
  expect(s.errors).toEqual([]);
});

test("changing schools in the selector is a draft until explicitly saved", async ({context, page}) => {
  await context.route(`${api}/api/v2/catalog/schools`, r => r.fulfill({json: {data: [
    {id: "school", name: "A学校"}, {id: "school-b", name: "B学校"},
  ]}}));
  await context.route(`${api}/api/v2/catalog/terms/current?**`, r => r.fulfill({json: {data:
    new URL(r.request().url()).searchParams.get("schoolId") === "school-b"
      ? {id: "term-b", schoolId: "school-b"} : {id: "term", schoolId: "school"},
  }}));
  await context.route(`${api}/api/v2/catalog/workspaces?**`, r => r.fulfill({json: {data:
    new URL(r.request().url()).searchParams.get("termId") === "term-b"
      ? [{id: "class-b", name: "B校一班", type: "ADMIN_CLASS"}]
      : [{id: "class-a", name: "高一一班", type: "ADMIN_CLASS"}],
  }}));
  await context.route(`${api}/api/v2/catalog/administrative-classes/class-b/course-options`, r => r.fulfill({json: {data:
    {administrativeClass: {id: "class-b", name: "B校一班"}, subjects: []},
  }}));
  await context.route(`${api}/api/v2/catalog/administrative-classes/class-b/student-selection/validate`, r => r.fulfill({json: {data:
    {normalized: r.request().postDataJSON(), issues: [], confirmedAt: new Date().toISOString()},
  }}));
  const s = await openStudent(context, page, false);
  await expect(page.getByText("行政班作业保持可见", {exact: true})).toBeVisible();
  const original = await page.evaluate(key => localStorage.getItem(key), selectionKey);
  const dialog = page.getByRole("dialog");
  const chooseB = async () => {
    await page.getByRole("button", {name: "修改选班"}).click();
    await dialog.locator(".v-select").filter({hasText: /^学校/}).click();
    await page.getByRole("option", {name: "B学校", exact: true}).click();
    await dialog.locator(".v-select").filter({hasText: /^行政班/}).click();
    await page.getByRole("option", {name: "B校一班", exact: true}).click();
    await expect(dialog.getByRole("button", {name: "保存并查看作业"})).toBeEnabled();
  };
  await chooseB();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("行政班作业保持可见", {exact: true})).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), selectionKey)).toBe(original);
  expect(s.feeds.every(ids => !ids.includes("class-b"))).toBe(true);
  await chooseB();
  await dialog.getByRole("button", {name: "保存并查看作业"}).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).administrativeClassId, selectionKey)).toBe("class-b");
  await expect.poll(() => s.feeds.some(ids => ids.includes("class-b") && !ids.includes("class-a"))).toBe(true);
  expect(s.errors).toEqual([]);
});
