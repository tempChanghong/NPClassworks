// Regressions for the three confirmed publishing review findings.
import {test, expect} from "./fixture.js";
import {api} from "../e2e/environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";
import {shiftBoardDate} from "../../src/utils/boardDate.js";
import {templateFields} from "../../src/utils/homeworkTemplates.js";

async function create(classroom, request, contentJson = {}) {
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const response = await request.post(`${api}/api/v2/publications`, {headers, data: {
    type: "ASSIGNMENT", status: "PUBLISHED", subjectId: classroom.subject.id, targetWorkspaceIds: [classroom.workspace.id],
    boardDate: preparationToday(), content: "原正文", contentJson,
  }});
  expect(response.status()).toBe(201);
  return {row: (await response.json()).data, headers};
}

for (const clearMetadata of [false, true]) {
test(`screen conflict saves local text while retaining ${clearMetadata ? "cleared" : "updated"} server metadata`, async ({classroom, request}) => {
  const date = shiftBoardDate(preparationToday(), 1);
  const old = {submission: "交给课代表", preparation: {text: "圆规", date}};
  const latest = clearMetadata ? null : {submission: "改交给老师", preparation: {text: "实验材料", date: shiftBoardDate(date, 1)}};
  const {row, headers} = await create(classroom, request, old);
  const screen = await classroom.open("screen");
  await screen.page.getByRole("button", {name: "修改", exact: true}).click();
  await screen.page.getByRole("textbox", {name: "作业内容 作业内容", exact: true}).fill("大屏只想修改正文");
  expect((await request.patch(`${api}/api/v2/publications/${row.id}`, {headers: {...headers, "If-Match": '"1"'}, data: {contentJson: latest}})).status()).toBe(200);
  await screen.page.getByRole("button", {name: "保存作业", exact: true}).click();
  await expect(screen.page.getByRole("button", {name: "以本机输入生成新版本", exact: true})).toBeVisible();
  await screen.page.getByRole("button", {name: "以本机输入生成新版本", exact: true}).click();
  const savedResponse = screen.page.waitForResponse(response => response.request().method() === "PATCH" && response.url().endsWith(`/publications/${row.id}`));
  await screen.page.getByRole("button", {name: "保存新版本", exact: true}).click();
  const saved = await savedResponse;
  expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON()).not.toHaveProperty("contentJson");
  await expect(screen.page.locator(".screen-composer")).not.toBeVisible();
  const current = (await classroom.rows())[0];
  expect(current.revision).toBe(3);
  expect(current.content).toBe("大屏只想修改正文");
  expect(current.contentJson).toEqual(latest);
  expect(screen.errors).toEqual([]);
});
}

for (const newReason of ["", "下一次更正的新原因"]) {
test(`delayed save consumes its submitted reason but retains later input (${newReason || "reason unchanged"})`, async ({classroom, request}) => {
  const {row} = await create(classroom, request);
  const teacher = await classroom.open("teacher"), composer = teacher.page.locator(".publication-composer");
  await teacher.page.locator(".publication-list-item button").filter({has: teacher.page.locator(".mdi-dots-vertical")}).click();
  await teacher.page.getByText("编辑", {exact: true}).click();
  const body = composer.getByRole("textbox", {name: "正文 正文", exact: true});
  const reason = composer.getByLabel("本次更正原因（可选）", {exact: true});
  await body.fill("第一次更正"); await reason.fill("第一次更正的原因");
  let release, started = false;
  const gate = new Promise(resolve => { release = resolve; });
  await teacher.page.route(`${api}/api/v2/publications/${row.id}`, async route => {
    if (route.request().method() === "PATCH" && !started) { started = true; await gate; }
    await route.continue();
  });
  try {
    await composer.getByRole("button", {name: "保存修改", exact: true}).click();
    await expect.poll(() => started).toBe(true);
    await body.fill("下一次独立更正");
    if (newReason) await reason.fill(newReason);
    release();
    await expect(composer).toContainText("之后输入的修改仍未保存");
    await expect(reason).toHaveValue(newReason);
    const ack = teacher.page.getByRole("button", {name: "知道了", exact: true});
    if (await ack.isVisible()) await ack.click();
    await composer.getByRole("button", {name: "保存修改", exact: true}).click();
    await expect.poll(async () => (await classroom.rows())[0].revision).toBe(3);
    const reasons = (await classroom.rows())[0].revisions.map(item => item.snapshot.contentJson?.correctionReason || null);
    expect(reasons).toEqual([null, "第一次更正的原因", newReason || null]);
    expect(teacher.errors).toEqual([]);
  } finally { release(); }
});
}

for (const field of ["submission", "materials"]) {
test(`merged template ${field} placeholders are validated before committing and explicit clearing remains supported`, async ({classroom, request}) => {
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const endpoint = `${api}/accounts/preferences/homework-templates`;
  const response = await request.post(endpoint, {headers, data: {name: "模板", title: "作业", content: "题目", [field]: "〔课代表〕"}});
  expect(response.status()).toBe(201);
  const created = (await response.json()).data;
  const updated = await request.put(`${endpoint}/${created.id}`, {headers, data: {name: "旧客户端修改", title: "作业",
    content: Array.from({length: 10}, (_, i) => `〔题号${i}〕`).join(" "), expectedRevision: 1}});
  expect(updated.status()).toBe(422);
  const read = async () => (await (await request.get(endpoint, {headers})).json()).data.find(item => item.id === created.id);
  expect(await read()).toEqual(created);
  const data = {name: "有效修改", title: "作业", content: Array.from({length: 10}, (_, i) => `〔题号${i}〕`).join(" "), expectedRevision: 1};
  const cleared = await request.put(`${endpoint}/${created.id}`, {headers, data: {...data, [field]: ""}});
  expect(cleared.status()).toBe(200);
  const saved = (await cleared.json()).data;
  expect(saved.revision).toBe(2);
  expect(saved[field]).toBeUndefined();
  expect(templateFields(saved)).toHaveLength(10);
  expect(await read()).toEqual(saved);
});
}
