import {test, expect} from "./fixture.js";
import {api} from "../e2e/environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";
import {shiftBoardDate} from "../../src/utils/boardDate.js";

test("teacher previews each class without publishing, then submission instructions and reasons reach screen and history", async ({classroom}, testInfo) => {
  const teacher = await classroom.open("teacher");
  const second = await classroom.prisma.workspace.create({data: {
    termId: classroom.workspace.termId, gradeId: classroom.workspace.gradeId, code: "C2", name: "高一二班", type: "ADMIN_CLASS",
    subjectRules: {create: {subjectId: classroom.subject.id, deliveryMode: "ADMIN_CLASS"}},
    members: {create: {accountId: classroom.account.id, role: "TEACHER"}},
    teachingAssignments: {create: {accountId: classroom.account.id, subjectId: classroom.subject.id}},
  }});
  await teacher.page.reload();
  const screen = await classroom.open("screen"), composer = teacher.page.locator(".publication-composer");
  const today = preparationToday(), tomorrow = shiftBoardDate(today, 1);
  await composer.locator(".v-select").filter({hasText: "科目"}).click();
  await teacher.page.getByRole("option", {name: "数学", exact: true}).click();
  await composer.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
  for (const name of ["高一一班", "高一二班"]) await teacher.page.getByRole("option", {name: new RegExp(name)}).click();
  await teacher.page.keyboard.press("Escape");
  const body = composer.getByRole("textbox", {name: "正文 正文", exact: true});
  await body.fill("完成练习第一至五题");
  await composer.getByLabel("提交说明（可选）", {exact: true}).fill("早读交给数学课代表");
  await composer.getByLabel("需带物品（可选）", {exact: true}).fill("圆规");
  await composer.getByLabel("携带日期", {exact: true}).fill(tomorrow);
  await composer.getByLabel("截止时间（可选）", {exact: true}).fill(`${tomorrow}T08:00`);
  let writes = 0;
  const countWrite = request => { if (request.url().includes("/api/v2/publications") && request.method() === "POST") writes++; };
  teacher.page.on("request", countWrite);
  await composer.getByRole("button", {name: "预览大屏效果", exact: true}).click();
  const preview = teacher.page.getByRole("dialog", {name: "发布前大屏预览"});
  await expect(preview).toContainText("尚未发布");
  await expect(preview.locator(".publication-card")).toContainText("高一一班");
  await expect(preview.locator(".submission-details")).toHaveText("提交说明：早读交给数学课代表");
  await expect(preview).toContainText(tomorrow);
  await teacher.page.screenshot({path: testInfo.outputPath("preview.png"), animations: "disabled"});
  await preview.locator(".v-select").click();
  await teacher.page.getByRole("option", {name: second.name, exact: true}).click();
  await expect(preview.locator(".publication-card")).toContainText("高一二班");
  await expect(preview.locator(".publication-card")).not.toContainText("高一一班");
  await preview.getByRole("button", {name: "返回编辑", exact: true}).click();
  await composer.getByLabel("该科目在所选日期无作业", {exact: true}).check();
  await composer.getByRole("button", {name: "预览大屏效果", exact: true}).click();
  await expect(preview).toContainText("今日无作业");
  await expect(preview.locator(".submission-details")).toHaveCount(0);
  await preview.getByRole("button", {name: "返回编辑", exact: true}).click();
  await composer.getByLabel("该科目在所选日期无作业", {exact: true}).uncheck();
  expect(writes).toBe(0); expect(await classroom.rows()).toHaveLength(0);
  teacher.page.off("request", countWrite);
  await composer.getByRole("button", {name: "正式发布", exact: true}).click();
  await expect(screen.page.locator(".submission-details")).toContainText("早读交给数学课代表");
  await teacher.page.getByRole("dialog").filter({hasText: "作业发布结果"}).getByRole("button", {name: "完成", exact: true}).click();
  await teacher.page.locator(".publication-list-item button").filter({has: teacher.page.locator(".mdi-dots-vertical")}).click();
  await teacher.page.getByText("编辑", {exact: true}).click();
  await body.fill("只完成前三题");
  await composer.getByLabel("本次更正原因（可选）", {exact: true}).fill("课堂进度调整");
  await composer.getByRole("button", {name: "保存修改", exact: true}).click();
  await expect(screen.page.locator(".screen-homework-changes")).toContainText("更正原因：课堂进度调整");
  await teacher.page.getByRole("dialog").filter({hasText: "作业发布结果"}).getByRole("button", {name: "完成", exact: true}).click();
  const [row] = await classroom.rows();
  expect(row.revisions[1].snapshot.contentJson.correctionReason).toBe("课堂进度调整");
  await teacher.page.locator(".publication-list-item button").filter({has: teacher.page.locator(".mdi-dots-vertical")}).click();
  await teacher.page.getByText("版本历史与恢复", {exact: true}).click();
  await expect(teacher.page.getByRole("dialog")).toContainText("更正原因：课堂进度调整");
  await teacher.page.getByRole("dialog").getByRole("button", {name: "关闭", exact: true}).click();
  await teacher.page.locator(".publication-list-item button").filter({has: teacher.page.locator(".mdi-dots-vertical")}).click();
  await teacher.page.getByText("编辑", {exact: true}).click();
  await expect(composer.getByLabel("本次更正原因（可选）", {exact: true})).toHaveValue("");
  await composer.getByRole("button", {name: "取消编辑", exact: true}).click();
  await screen.page.getByTitle("更多", {exact: true}).click();
  await screen.page.getByText("打印作业清单", {exact: true}).click();
  await expect(screen.page.frameLocator('iframe[title="作业清单打印预览"]').getByText("提交说明：早读交给数学课代表")).toBeVisible();
  await screen.page.getByRole("button", {name: "生成清单图片", exact: true}).click();
  await expect(screen.page.locator(".homework-image-results img")).toHaveCount(1);
  expect([...teacher.errors, ...screen.errors]).toEqual([]);
});

test("reasons never carry into copies, restores or screen edits; legacy template updates preserve submission instructions", async ({classroom, request}) => {
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const created = await request.post(`${api}/api/v2/publications`, {headers, data: {
    type: "ASSIGNMENT", status: "PUBLISHED", subjectId: classroom.subject.id, targetWorkspaceIds: [classroom.workspace.id],
    boardDate: preparationToday(), content: "原作业", contentJson: {submission: "交给数学课代表", correctionReason: "不能伪造"},
  }});
  expect(created.status()).toBe(201);
  const row = (await created.json()).data;
  expect(row.contentJson.correctionReason).toBeUndefined();
  const endpoint = `${api}/api/v2/publications/${row.id}`;
  const patch = (revision, data) => request.patch(endpoint, {headers: {...headers, "If-Match": `"${revision}"`}, data});
  expect((await patch(1, {content: "新作业", correctionReason: "教师调整"})).status()).toBe(200);
  const stale = await patch(1, {content: "覆盖", correctionReason: "过期输入"}); expect(stale.status()).toBe(409);
  const copy = await request.post(endpoint + "/clone", {headers, data: {}});
  expect(copy.status()).toBe(201);
  const cloned = (await copy.json()).data;
  expect(cloned.contentJson).toEqual({submission: "交给数学课代表"});
  expect((await patch(2, {content: "无原因的新修改"})).status()).toBe(200);
  let current = (await (await request.get(endpoint, {headers})).json()).data;
  expect(current.contentJson).toEqual({submission: "交给数学课代表"});
  expect((await request.post(endpoint + "/restore", {headers: {...headers, "If-Match": '"3"'}, data: {sourceRevision: 2}})).status()).toBe(200);
  current = (await (await request.get(endpoint, {headers})).json()).data;
  expect(current.contentJson.correctionReason).toBeUndefined();
  expect((await patch(4, {content: "再次更正", correctionReason: "再调整"})).status()).toBe(200);
  const screenEdit = await request.patch(`${api}/api/v2/classroom-screens/publications/${row.id}`, {
    headers: {"X-Classworks-Screen-Token": classroom.screenToken, "If-Match": '"5"'}, data: {content: "大屏更正", contentJson: {submission: "交讲台", correctionReason: "不应沿用"}},
  });
  expect(screenEdit.status()).toBe(200);
  expect((await screenEdit.json()).data.contentJson).toEqual({submission: "交讲台"});
  expect((await patch(6, {correctionReason: "字".repeat(301)})).status()).toBe(422);
  const templates = `${api}/accounts/preferences/homework-templates`;
  const template = (await (await request.post(templates, {headers, data: {name: "上交模板", title: "练习", content: "完成五题", submission: "交给〔课代表〕"}})).json()).data;
  const legacy = await request.put(`${templates}/${template.id}`, {headers, data: {name: "旧客户端改名", title: "练习", content: "完成五题", expectedRevision: 1}});
  expect((await legacy.json()).data.submission).toBe("交给〔课代表〕");
  const teacher = await classroom.open("teacher"), composer = teacher.page.locator(".publication-composer");
  await composer.getByRole("button", {name: "个人作业模板", exact: true}).click();
  const dialog = teacher.page.locator(".homework-templates");
  await dialog.getByRole("button", {name: "填写使用", exact: true}).click();
  await dialog.getByLabel("填写：课代表", {exact: true}).fill("小王");
  await dialog.getByRole("button", {name: "套用到编辑器", exact: true}).click();
  await expect(composer.getByLabel("提交说明（可选）", {exact: true})).toHaveValue("交给小王");
  expect(teacher.errors).toEqual([]);
});
