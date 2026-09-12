// Real HTTP, PostgreSQL and UI regressions for the follow-up publishing review.
import {test, expect} from "./fixture.js";
import {api} from "../e2e/environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";
import {shiftBoardDate} from "../../src/utils/boardDate.js";

async function create(classroom, request) {
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const metadata = {submission: "早读交到数学课代表处", preparation: {text: "实验圆规和三角板", date: shiftBoardDate(preparationToday(), 1)}};
  const response = await request.post(`${api}/api/v2/publications`, {headers, data: {
    type: "ASSIGNMENT", status: "PUBLISHED", subjectId: classroom.subject.id,
    targetWorkspaceIds: [classroom.workspace.id], boardDate: preparationToday(), content: "完成第一至五题", contentJson: metadata,
    publishAt: `${shiftBoardDate(preparationToday(), -1)}T00:00:00+08:00`, dueAt: `${preparationToday()}T12:00:00+08:00`,
  }});
  expect(response.status()).toBe(201);
  return {headers, row: (await response.json()).data, metadata};
}

test("weekly overview shows submission and preparation details in both date views", async ({classroom, request}, testInfo) => {
  const {metadata} = await create(classroom, request);
  const screen = await classroom.open("screen");
  await expect(screen.page.locator(".submission-details")).toContainText(metadata.submission);
  await expect(screen.page.locator(".preparation-board")).toContainText(metadata.preparation.text);
  await screen.page.getByTitle("更多", {exact: true}).click();
  const response = screen.page.waitForResponse(r => r.url().includes("weekStart=") && r.request().method() === "GET");
  await screen.page.getByText("一周总览", {exact: true}).click();
  const data = (await (await response).json()).data;
  expect(data.items[0].contentJson).toEqual(metadata);
  const week = screen.page.locator(".homework-week-dialog");
  await expect(week.locator(".week-assignment")).toHaveCount(1);
  await expect(week).toContainText("完成第一至五题");
  const checkDetails = async () => {
    await expect(week.locator(".submission-details")).toContainText(metadata.submission);
    await expect(week.locator(".preparation-details")).toContainText(metadata.preparation.text);
    await expect(week.locator(".preparation-details")).toContainText(metadata.preparation.date);
  };
  await checkDetails();
  await week.locator(".v-select").filter({hasText: "查看方式"}).click();
  await screen.page.getByRole("option", {name: "按截止日期", exact: true}).click();
  await expect(week.locator(".week-assignment")).toHaveCount(1);
  await expect(week).toContainText(`作业板日期：${preparationToday()}`);
  await checkDetails();
  await screen.page.screenshot({path: testInfo.outputPath("weekly-complete-details.png")});
  expect(screen.errors).toEqual([]);
});

test("stale certification shows a conflict while same-version confirmation stays idempotent", async ({classroom, request}, testInfo) => {
  const {headers, row} = await create(classroom, request);
  const endpoint = `${api}/api/v2/publications/${row.id}`;
  const pending = await request.patch(`${api}/api/v2/classroom-screens/publications/${row.id}`, {
    headers: {"X-Classworks-Screen-Token": classroom.screenToken, "If-Match": '"1"'}, data: {content: "大屏第二版待确认"},
  });
  expect(pending.status()).toBe(200);
  expect((await pending.json()).data.isCertified).toBe(false);
  const teacher = await classroom.open("teacher");
  let release, started = false;
  const gate = new Promise(resolve => { release = resolve; });
  await teacher.page.route(endpoint + "/certify", async route => {
    started = true; await gate; await route.continue();
  });
  try {
    const response = teacher.page.waitForResponse(r => r.url() === endpoint + "/certify");
    await teacher.page.locator(".teacher-action-center").getByRole("button", {name: "确认此版本", exact: true}).click();
    await expect.poll(() => started).toBe(true);
    const updated = await request.patch(endpoint, {headers: {...headers, "If-Match": '"2"'}, data: {content: "新版要求完成十题"}});
    expect(updated.status()).toBe(200);
    expect((await updated.json()).data.isCertified).toBe(true);
    release();
    const stale = await response;
    expect(stale.request().headers()["if-match"]).toBe('"2"');
    expect(stale.status()).toBe(409);
    await expect(teacher.page.getByText("没有确认旧版本", {exact: true})).toBeVisible();
    await expect(teacher.page.getByText("版本 2 · 待处理事项已完成", {exact: true})).not.toBeVisible();
    const stored = (await classroom.rows())[0];
    expect(stored.revision).toBe(3);
    expect(stored.revisions[1].isCertified).toBe(false);
    const certify = revision => request.post(endpoint + "/certify", {headers: {...headers, "If-Match": `"${revision}"`}, data: {}});
    const repeat = await certify(3);
    expect(repeat.status()).toBe(200);
    expect((await repeat.json()).data.revision).toBe(3);
    const changed = await request.patch(`${api}/api/v2/classroom-screens/publications/${row.id}`, {
      headers: {"X-Classworks-Screen-Token": classroom.screenToken, "If-Match": '"3"'}, data: {content: "大屏第四版待确认"},
    });
    expect(changed.status()).toBe(200);
    expect((await certify(3)).status()).toBe(409);
    const confirmed = await certify(4);
    expect(confirmed.status()).toBe(200);
    expect((await confirmed.json()).data.isCertified).toBe(true);
    expect((await certify(4)).status()).toBe(200);
    expect((await classroom.rows())[0].revision).toBe(4);
    expect((await classroom.rows())[0].revisions[3].isCertified).toBe(true);
    await teacher.page.screenshot({path: testInfo.outputPath("stale-confirmation-rejected.png")});
    expect(teacher.errors).toEqual([]);
  } finally { release(); }
});

test("applying cleared template fields removes old editor requirements before publishing", async ({classroom, request}, testInfo) => {
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const endpoint = `${api}/accounts/preferences/homework-templates`;
  const created = await request.post(endpoint, {headers, data: {name: "不用上交和携带", title: "新模板作业", content: "口头复习", submission: "旧上交方式", materials: "旧物品"}});
  expect(created.status()).toBe(201);
  const row = (await created.json()).data;
  const teacher = await classroom.open("teacher"), composer = teacher.page.locator(".publication-composer");
  await composer.locator(".v-select").filter({hasText: "科目"}).click();
  await teacher.page.getByRole("option", {name: "数学", exact: true}).click();
  await composer.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
  await teacher.page.getByRole("option", {name: /高一一班/}).click();
  await teacher.page.keyboard.press("Escape");
  await composer.getByLabel("提交说明（可选）", {exact: true}).fill("旧上交方式");
  await composer.getByLabel("需带物品（可选）", {exact: true}).fill("旧物品");
  await composer.getByLabel("携带日期", {exact: true}).fill(shiftBoardDate(preparationToday(), 1));
  await composer.getByRole("button", {name: "个人作业模板", exact: true}).click();
  const templates = teacher.page.locator(".homework-templates");
  await templates.getByRole("button", {name: "编辑", exact: true}).click();
  await templates.getByLabel("模板提交说明（可选）", {exact: true}).fill("");
  await templates.getByLabel("模板需带物品（可选）", {exact: true}).fill("");
  const updated = teacher.page.waitForResponse(r => r.request().method() === "PUT" && r.url().endsWith(row.id));
  await templates.getByRole("button", {name: "保存模板", exact: true}).click();
  expect((await updated).status()).toBe(200);
  await templates.getByRole("button", {name: "填写使用", exact: true}).click();
  await expect(templates.locator(".template-preview")).toContainText("口头复习");
  await expect(templates.locator(".template-preview")).not.toContainText("旧上交方式");
  await expect(templates.locator(".template-preview")).not.toContainText("旧物品");
  await templates.getByRole("button", {name: "套用到编辑器", exact: true}).click();
  await teacher.page.getByRole("button", {name: "替换内容", exact: true}).click();
  await expect(templates).not.toBeVisible();
  await expect(composer.getByRole("textbox", {name: "正文 正文", exact: true})).toHaveValue("口头复习");
  await expect(composer.getByLabel("提交说明（可选）", {exact: true})).toHaveValue("");
  await expect(composer.getByLabel("需带物品（可选）", {exact: true})).toHaveValue("");
  await expect(composer.getByLabel("携带日期", {exact: true})).toHaveValue("");
  await teacher.page.screenshot({path: testInfo.outputPath("template-cleared-fields.png")});
  await composer.getByRole("button", {name: "正式发布", exact: true}).click();
  await expect.poll(async () => (await classroom.rows()).length).toBe(1);
  const [saved] = await classroom.rows();
  expect(saved.content).toBe("口头复习");
  expect(saved.contentJson).toBeNull();
  expect(teacher.errors).toEqual([]);
});
