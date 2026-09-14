import {test, expect} from "./fixture.js";
import {api} from "../e2e/environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";
import {shiftBoardDate} from "../../src/utils/boardDate.js";

test("tomorrow checklist reads old due work and packing items from PostgreSQL and exports separated unknown deadlines", async ({classroom, request}) => {
  const today = preparationToday(), tomorrow = shiftBoardDate(today, 1), old = shiftBoardDate(today, -60);
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  async function create(input) {
    const response = await request.post(`${api}/api/v2/publications`, {headers, data: {type: "ASSIGNMENT", status: "PUBLISHED",
      subjectId: classroom.subject.id, targetWorkspaceIds: [classroom.workspace.id], boardDate: today,
      content: "测试正文", publishAt: `${old}T00:00:00+08:00`, ...input}});
    expect(response.status()).toBe(201); return (await response.json()).data;
  }
  const due = await create({boardDate: old, content: "很早布置明天上交", dueAt: `${tomorrow}T07:30:00+08:00`,
    contentJson: {submission: "早读前交给课代表", optionalContent: "选做拓展题"}});
  await create({boardDate: old, content: "明日实验准备", contentJson: {preparation: {text: "圆规和实验材料", date: tomorrow}}});
  await create({content: "今日截止时间未设置"});
  await create({boardDate: old, content: "历史未设截止不应混入"});
  await create({content: "后天截止不应混入", dueAt: `${shiftBoardDate(today, 2)}T00:00:00+08:00`});
  await create({status: "DRAFT", content: "未发布不能显示", dueAt: `${tomorrow}T07:30:00+08:00`});
  const screen = await classroom.open("screen");
  await screen.page.getByLabel("选择日期").fill(old);
  await expect(screen.page.locator(".publication-content").filter({hasText: "很早布置明天上交"})).toBeVisible();
  await screen.page.getByRole("button", {name: "明日要交与需带", exact: true}).click();
  const dialog = screen.page.locator(".homework-tomorrow-dialog");
  await expect(dialog.locator(".tomorrow-due .tomorrow-row")).toHaveCount(1);
  await expect(dialog.locator(".tomorrow-due")).toContainText("很早布置明天上交");
  await expect(dialog.locator(".tomorrow-due")).toContainText("早读前交给课代表");
  await expect(dialog.locator(".tomorrow-preparations")).toContainText("圆规和实验材料");
  await expect(dialog.locator(".tomorrow-unknown .tomorrow-row")).toHaveCount(1);
  await expect(dialog.locator(".tomorrow-unknown")).toContainText("今日截止时间未设置");
  await expect(dialog).not.toContainText("历史未设截止不应混入");
  await expect(dialog).not.toContainText("后天截止不应混入");
  await expect(dialog).not.toContainText("未发布不能显示");
  await expect(dialog).toContainText(tomorrow);
  await dialog.getByRole("button", {name: "打印作业清单", exact: true}).click();
  const print = screen.page.locator(".homework-print-dialog"), body = print.frameLocator("iframe").locator("body");
  for (const text of ["放学前核对清单", "明日要交", "截止未设置，请核对", "很早布置明天上交", "早读前交给课代表", "选做拓展题", "圆规和实验材料"]) await expect(body).toContainText(text);
  await print.getByRole("button", {name: "生成清单图片", exact: true}).click();
  await expect(print.locator(".homework-image-results img").first()).toBeVisible();
  const noticeRefresh = screen.page.waitForResponse(async response => {
    if (!response.url().includes("/classroom-screens/feed?") || !response.ok()) return false;
    try { return (await response.json()).data.items.some(item => item.content === "不影响清单的次要通知"); } catch { return false; }
  });
  await create({type: "NOTICE", subjectId: null, priority: "MINOR", content: "不影响清单的次要通知", publishAt: new Date().toISOString(),
    contentJson: {popupEnabled: false}});
  await noticeRefresh;
  await expect(print).toBeVisible();
  await expect(print.locator(".homework-image-results img").first()).toBeVisible();
  await print.getByRole("button", {name: "关闭", exact: true}).click();
  await dialog.getByRole("button", {name: "关闭", exact: true}).click();
  await screen.page.getByLabel("选择日期").fill(today);
  await expect(screen.page.locator(".publication-content").filter({hasText: "今日截止时间未设置"})).toBeVisible();
  await screen.page.getByRole("button", {name: "明日要交与需带", exact: true}).click();
  await expect(dialog.locator(".tomorrow-due")).toContainText("很早布置明天上交");
  expect((await request.post(`${api}/api/v2/publications/${due.id}/withdraw`, {headers: {...headers, "If-Match": '"1"'}, data: {}})).status()).toBe(200);
  await expect(dialog).toContainText("作业已变化");
  await expect(dialog.getByRole("button", {name: "打印作业清单", exact: true})).toHaveCount(0);
  await dialog.getByRole("button", {name: "刷新核对清单", exact: true}).click();
  await expect(dialog.locator(".tomorrow-due")).toContainText("没有明天截止的作业");
  expect(screen.errors).toEqual([]);

  const teacher = await classroom.open("teacher");
  await teacher.page.getByRole("button", {name: "明日要交与需带", exact: true}).click();
  const teacherDialog = teacher.page.locator(".homework-tomorrow-dialog");
  await teacherDialog.locator(".v-select").click();
  await teacher.page.getByRole("option", {name: /高一一班/}).click();
  await expect(teacherDialog.locator(".tomorrow-preparations")).toContainText("圆规和实验材料");
  await expect(teacherDialog.locator(".tomorrow-unknown")).toContainText("今日截止时间未设置");
  expect(teacher.errors).toEqual([]);
});
