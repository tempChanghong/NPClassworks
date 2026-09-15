import {test, expect} from "./fixture.js";
import {api} from "../e2e/environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";
import {shiftBoardDate} from "../../src/utils/boardDate.js";
const today = () => preparationToday();
const auth = classroom => ({Authorization: `Bearer ${classroom.credentials.accessToken}`});
async function create(classroom, request, input = {}) {
  const response = await request.post(`${api}/api/v2/publications`, {headers: auth(classroom), data: {
    type: "ASSIGNMENT", status: "PUBLISHED", subjectId: classroom.subject.id, targetWorkspaceIds: [classroom.workspace.id],
    boardDate: today(), content: "必做前五题", publishAt: `${shiftBoardDate(today(), -30)}T00:00:00+08:00`, ...input,
  }});
  expect(response.status()).toBe(201); return (await response.json()).data;
}

test("teacher optional homework reaches the board, templates and exports and can be explicitly cleared", async ({classroom, request}) => {
  const teacher = await classroom.open("teacher"), screen = await classroom.open("screen");
  const composer = teacher.page.locator(".publication-composer");
  await composer.locator(".v-select").filter({hasText: "科目"}).click();
  await teacher.page.getByRole("option", {name: "数学", exact: true}).click();
  await composer.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
  await teacher.page.getByRole("option", {name: /高一一班/}).click();
  await teacher.page.keyboard.press("Escape");
  await composer.getByRole("button", {name: "添加选做内容", exact: true}).click();
  await composer.getByRole("textbox", {name: "必做内容 必做内容", exact: true}).fill("完成基础题1—5");
  await composer.getByLabel("选做内容（可选）", {exact: true}).fill("挑战题6，可自愿完成");
  await composer.getByRole("button", {name: "正式发布", exact: true}).click();
  await expect(screen.page.locator(".optional-homework")).toContainText("挑战题6");
  await expect(screen.page.locator(".publication-content")).toContainText("必做：");
  const [row] = await classroom.rows();
  expect(row.contentJson.optionalContent).toBe("挑战题6，可自愿完成");
  const template = await request.post(`${api}/accounts/preferences/homework-templates`, {headers: auth(classroom), data: {name: "分层练习", title: "", content: "基础题", optionalContent: "拓展〔题号〕"}});
  expect(template.status()).toBe(201);
  const saved = (await template.json()).data;
  const legacyEdit = await request.put(`${api}/accounts/preferences/homework-templates/${saved.id}`, {headers: auth(classroom), data: {name: saved.name, title: "新模板", content: saved.content, expectedRevision: 1}});
  expect(legacyEdit.status()).toBe(200);
  expect((await legacyEdit.json()).data.optionalContent).toBe("拓展〔题号〕");
  await teacher.page.getByRole("dialog").filter({hasText: "作业发布结果"}).getByRole("button", {name: "完成", exact: true}).click();
  await composer.getByRole("button", {name: "个人作业模板", exact: true}).click();
  const templates = teacher.page.locator(".homework-templates");
  await templates.getByRole("button", {name: "填写使用", exact: true}).click();
  await templates.getByLabel("填写：题号", {exact: true}).fill("9");
  await templates.getByRole("button", {name: "套用到编辑器", exact: true}).click();
  await expect(composer.getByLabel("选做内容（可选）", {exact: true})).toHaveValue("拓展9");
  await screen.page.getByRole("button", {name: "更多", exact: true}).click();
  await screen.page.getByText("打印作业清单", {exact: true}).click();
  const print = screen.page.locator(".homework-print-dialog");
  await expect(print.frameLocator("iframe").locator("body")).toContainText("选做：挑战题6");
  await print.getByRole("button", {name: "关闭", exact: true}).click();
  const changed = await request.patch(`${api}/api/v2/publications/${row.id}`, {headers: {...auth(classroom), "If-Match": '"1"'}, data: {contentJson: {optionalContent: ""}}});
  expect(changed.status()).toBe(200);
  await expect(screen.page.locator(".optional-homework")).toHaveCount(0);
  await screen.page.getByRole("button", {name: "版本历史", exact: true}).click();
  await expect(screen.page.getByRole("dialog").filter({hasText: "不可删除的版本历史"})).toContainText("选做：挑战题6");
  expect(teacher.errors).toEqual([]); expect(screen.errors).toEqual([]);
});

test("late screens can review server corrections while draft history, private fields and withdrawn work remain hidden", async ({classroom, request}) => {
  const row = await create(classroom, request, {status: "DRAFT", content: "私密草稿"});
  const endpoint = `${api}/api/v2/publications/${row.id}`;
  const change = async (revision, data) => {
    const response = await request.patch(endpoint, {headers: {...auth(classroom), "If-Match": `"${revision}"`}, data});
    expect(response.status()).toBe(200);
  };
  await change(1, {status: "PUBLISHED", content: "公开前五题"});
  await change(2, {content: "公开前三题", correctionReason: "课堂进度调整", contentJson: {optionalContent: "选做第六题", unrelated: "私密元数据"}});
  const url = `${api}/api/v2/publications/feed/${row.id}/corrections`;
  const params = {workspaceIds: classroom.workspace.id, date: today()};
  const response = await request.get(url, {params});
  expect(response.status()).toBe(200);
  const data = (await response.json()).data;
  expect((await request.get(url, {params: {...params, date: "2026-13-01"}})).status()).toBe(400);
  const padded = await request.get(url, {params: {...params, date: ` ${today()} `}});
  expect(padded.status()).toBe(200);
  expect((await padded.json()).data).toEqual(data);
  expect(data.items).toHaveLength(1);
  expect(JSON.stringify(data)).not.toMatch(/私密|editorAccountId|targetWorkspaceIds/);
  expect((await request.get(url, {params: {...params, workspaceIds: "missing"}})).status()).toBe(403);
  const screen = await classroom.open("screen");
  await screen.page.getByTitle("更多", {exact: true}).click();
  await screen.page.getByText("查看今日更正", {exact: true}).click();
  const dialog = screen.page.locator(".homework-corrections-dialog");
  await expect(dialog).toContainText("公开前五题");
  await expect(dialog).toContainText("公开前三题");
  await expect(dialog).toContainText("课堂进度调整");
  await expect(dialog).not.toContainText("私密草稿");
  expect((await request.post(endpoint + "/withdraw", {headers: {...auth(classroom), "If-Match": '"3"'}, data: {}})).status()).toBe(200);
  expect((await request.get(url, {params})).status()).toBe(404);
  await expect(dialog.locator(".correction-entry")).toHaveCount(0);
  await expect(dialog).toContainText("作业已变化");
  await dialog.getByRole("button", {name: "刷新更正", exact: true}).click();
  await expect(dialog.locator(".correction-entry")).toHaveCount(0);
  expect(screen.errors).toEqual([]);
});

test("holiday selection includes older due work and manually selected pre-holiday work in printable images", async ({classroom, request}) => {
  const end = shiftBoardDate(today(), 6);
  await create(classroom, request, {boardDate: shiftBoardDate(today(), -20), content: "很早布置假期截止", dueAt: `${end}T08:00:00+08:00`, contentJson: {optionalContent: "假期选做拓展"}});
  await create(classroom, request, {boardDate: shiftBoardDate(today(), -1), content: "放假前补充内容"});
  const screen = await classroom.open("screen");
  await screen.page.getByTitle("更多", {exact: true}).click();
  await screen.page.getByText("放假作业汇总", {exact: true}).click();
  const dialog = screen.page.locator(".homework-holiday-dialog");
  await dialog.getByLabel("清单名称", {exact: true}).fill("假期核对清单");
  await dialog.getByRole("button", {name: "查找作业", exact: true}).click();
  await expect(dialog.locator(".holiday-assignment")).toHaveCount(2);
  await expect(dialog).toContainText("已选 1 / 2 项");
  await dialog.locator(".holiday-assignment").filter({hasText: "放假前补充内容"}).getByRole("checkbox").check();
  await dialog.getByRole("button", {name: "打印作业清单", exact: true}).click();
  const print = screen.page.locator(".homework-print-dialog"), body = print.frameLocator("iframe").locator("body");
  await expect(body).toContainText("假期核对清单");
  await expect(body).toContainText("很早布置假期截止");
  await expect(body).toContainText("放假前补充内容");
  await expect(body).toContainText("选做：假期选做拓展");
  await print.getByRole("button", {name: "生成清单图片", exact: true}).click();
  await expect(print.locator(".homework-image-results img").first()).toBeVisible();
  await print.getByRole("button", {name: "关闭", exact: true}).click();
  await dialog.getByLabel("假期结束", {exact: true}).fill(shiftBoardDate(today(), -1));
  await expect(dialog.getByRole("button", {name: "打印作业清单", exact: true})).toHaveCount(0);
  await dialog.getByRole("button", {name: "查找作业", exact: true}).click();
  await expect(dialog).toContainText("请填写有效日期");
  expect(screen.errors).toEqual([]);
});
