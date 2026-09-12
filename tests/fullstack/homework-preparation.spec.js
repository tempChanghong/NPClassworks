import {test, expect} from "./fixture.js";
import {api} from "../e2e/environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";
import {shiftBoardDate} from "../../src/utils/boardDate.js";

test("teacher preparations reach a screen across board dates, survive offline reload and remain in restored history", async ({classroom, request}) => {
  const today = preparationToday(), tomorrow = shiftBoardDate(today, 1), previous = shiftBoardDate(today, -1);
  const teacher = await classroom.open("teacher"), screen = await classroom.open("screen");
  const composer = teacher.page.locator(".publication-composer");
  await composer.locator(".v-select").filter({hasText: "科目"}).click();
  await teacher.page.getByRole("option", {name: "数学", exact: true}).click();
  await composer.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
  await teacher.page.getByRole("option", {name: /高一一班/}).click();
  await teacher.page.keyboard.press("Escape");
  await composer.getByRole("textbox", {name: "正文 正文", exact: true}).fill("明天上课使用圆规");
  await composer.getByLabel("需带物品（可选）", {exact: true}).fill("圆规与实验材料");
  await composer.getByRole("button", {name: "正式发布", exact: true}).click();
  await expect(composer).toContainText("请为需带物品选择有效的携带日期");
  expect(await classroom.rows()).toHaveLength(0);
  await composer.getByLabel("携带日期", {exact: true}).fill(tomorrow);
  const created = teacher.page.waitForResponse(r => r.url() === `${api}/api/v2/publications` && r.request().method() === "POST");
  await composer.getByRole("button", {name: "正式发布", exact: true}).click();
  expect((await created).status()).toBe(201);
  const [row] = await classroom.rows();
  expect(row.contentJson.preparation).toEqual({text: "圆规与实验材料", date: tomorrow});
  const board = screen.page.locator(".preparation-board");
  await expect(board).toContainText("明日需带");
  await expect(board).toContainText("圆规与实验材料");
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  expect((await request.patch(`${api}/api/v2/publications/${row.id}`, {headers: {...headers, "If-Match": '"1"'}, data: {boardDate: previous}})).ok()).toBe(true);
  await expect(board).toContainText("圆规与实验材料");
  await expect(screen.page.locator(".publication-body")).toHaveCount(0);
  const legacy = (await (await request.get(`${api}/api/v2/publications/feed`, {params: {workspaceIds: classroom.workspace.id, boardDate: today}})).json()).data;
  expect(legacy.items).toHaveLength(0);
  const enriched = (await (await request.get(`${api}/api/v2/publications/feed`, {params: {workspaceIds: classroom.workspace.id, boardDate: today, includePreparations: true}})).json()).data;
  expect(enriched.items.map(item => item.id)).toEqual([row.id]);
  await screen.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => screen.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await screen.context.setOffline(true);
  await screen.page.reload();
  await expect(board).toContainText("圆规与实验材料");
  await screen.page.getByTitle("更多", {exact: true}).click();
  await screen.page.getByText("打印作业清单", {exact: true}).click();
  await expect(screen.page.frameLocator('iframe[title="作业清单打印预览"]').getByText("圆规与实验材料", {exact: false})).toBeVisible();
  await screen.page.getByRole("button", {name: "生成清单图片", exact: true}).click();
  await expect(screen.page.locator(".homework-image-results img")).toHaveCount(1);
  await screen.page.getByRole("button", {name: "关闭", exact: true}).last().click();
  await screen.page.clock.install({time: new Date(`${shiftBoardDate(tomorrow, 1)}T00:00:01+08:00`)});
  await screen.page.clock.runFor(2000);
  await expect(board).not.toBeVisible();
  await screen.context.setOffline(false);
  expect((await request.post(`${api}/api/v2/publications/${row.id}/withdraw`, {headers: {...headers, "If-Match": '"2"'}, data: {}})).ok()).toBe(true);
  const revisions = (await (await request.get(`${api}/api/v2/publications/${row.id}/revisions`, {headers})).json()).data;
  expect(JSON.stringify(revisions)).toContain("圆规与实验材料");
  expect((await request.post(`${api}/api/v2/publications/${row.id}/restore`, {headers: {...headers, "If-Match": '"3"'}, data: {sourceRevision: 1}})).ok()).toBe(true);
  expect((await classroom.rows())[0].contentJson.preparation.date).toBe(tomorrow);
  expect((await request.patch(`${api}/api/v2/publications/${row.id}`, {headers: {...headers, "If-Match": '"4"'}, data: {contentJson: null}})).ok()).toBe(true);
  expect((await classroom.rows())[0].contentJson).toBeNull();
  expect([...teacher.errors, ...screen.errors]).toEqual([]);
});

test("preparation feed paging and template updates retain metadata without leaking drafts or other classes", async ({classroom, request}) => {
  const today = preparationToday(), tomorrow = shiftBoardDate(today, 1), previous = shiftBoardDate(today, -1);
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const preparation = {date: tomorrow, text: "携带圆规"};
  const response = await request.post(`${api}/api/v2/publications`, {headers, data: {
    type: "ASSIGNMENT", status: "PUBLISHED", subjectId: classroom.subject.id, targetWorkspaceIds: [classroom.workspace.id],
    boardDate: previous, content: "来源作业", contentJson: {preparation},
  }});
  expect(response.status()).toBe(201);
  const row = (await response.json()).data;
  const templateEndpoint = `${api}/accounts/preferences/homework-templates`;
  const template = (await (await request.post(templateEndpoint, {headers, data: {name: "准备工具", title: "预习", content: "看书", materials: "圆规"}})).json()).data;
  expect(template.materials).toBe("圆规");
  const updated = await request.put(templateEndpoint + "/" + template.id, {headers, data: {name: "改名", title: "预习", content: "看书", expectedRevision: 1}});
  expect((await updated.json()).data.materials).toBe("圆规");
  for (let revision = 2; revision < 7; revision++) {
    const race = await Promise.all(["甲", "乙"].map(name => request.put(templateEndpoint + "/" + template.id, {headers,
      data: {name, title: "预习", content: "看书", expectedRevision: revision}})));
    expect(race.map(result => result.status()).sort()).toEqual([200, 409]);
    expect((await (await request.get(templateEndpoint, {headers})).json()).data[0].materials).toBe("圆规");
  }
  const teacher = await classroom.open("teacher");
  const composer = teacher.page.locator(".publication-composer");
  await composer.getByLabel("需带物品（可选）", {exact: true}).fill("原物品");
  await composer.getByLabel("携带日期", {exact: true}).fill(tomorrow);
  await composer.getByRole("button", {name: "个人作业模板", exact: true}).click();
  const templates = teacher.page.locator(".homework-templates");
  await templates.getByRole("button", {name: "填写使用", exact: true}).click();
  await templates.getByRole("button", {name: "套用到编辑器", exact: true}).click();
  await teacher.page.getByRole("button", {name: "替换内容", exact: true}).click();
  await expect(composer.getByLabel("需带物品（可选）", {exact: true})).toHaveValue("圆规");
  await expect(composer.getByLabel("携带日期", {exact: true})).toHaveValue("");
  const copy = await request.post(`${api}/api/v2/publications/${row.id}/clone`, {headers, data: {boardDate: today}});
  expect(copy.ok()).toBe(true);
  expect((await copy.json()).data.contentJson?.preparation).toBeUndefined();
  const drafts = await classroom.prisma.publication.updateMany({where: {id: {not: row.id}, subjectId: classroom.subject.id}, data: {contentJson: {preparation}}});
  expect(drafts.count).toBe(1);
  for (let i = 0; i < 101; i++) {
    await classroom.prisma.publication.create({data: {type: "ASSIGNMENT", status: "PUBLISHED", boardDate: new Date(previous), publishAt: new Date(),
      content: `分页准备${i}`, subjectId: classroom.subject.id, authorAccountId: classroom.account.id, contentJson: {preparation},
      targets: {create: {workspaceId: classroom.workspace.id}}}});
  }
  const otherClass = await classroom.prisma.workspace.create({data: {termId: classroom.workspace.termId, type: "ADMIN_CLASS", code: "OTHER", name: "别班"}});
  for (const data of [{workspaceId: otherClass.id, publishAt: new Date()}, {workspaceId: classroom.workspace.id, publishAt: new Date(Date.now() + 86400000)}]) {
    await classroom.prisma.publication.create({data: {type: "ASSIGNMENT", status: "PUBLISHED", boardDate: new Date(previous), publishAt: data.publishAt,
      content: "不应进入本班当前清单", subjectId: classroom.subject.id, authorAccountId: classroom.account.id, contentJson: {preparation},
      targets: {create: {workspaceId: data.workspaceId}}}});
  }
  const ids = []; let afterId = "";
  do {
    const page = (await (await request.get(`${api}/api/v2/publications/feed`, {params: {workspaceIds: classroom.workspace.id, boardDate: today, includePreparations: true, limit: 100, afterId}})).json()).data;
    ids.push(...page.items.map(item => item.id)); afterId = page.nextAfterId;
  } while (afterId);
  expect(new Set(ids).size).toBe(102);
  const screen = await classroom.open("screen");
  await expect(screen.page.locator(".preparation-board__item")).toHaveCount(102);
  await expect(screen.page.locator(".publication-body")).toHaveCount(0);
  expect(screen.errors).toEqual([]);
  expect(teacher.errors).toEqual([]);
});
