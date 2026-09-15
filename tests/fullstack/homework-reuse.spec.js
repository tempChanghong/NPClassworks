import {test, expect} from "./fixture.js";
import {api} from "../e2e/environment.js";
import {todayBoardDate, shiftBoardDate} from "../../src/utils/boardDate.js";

async function create(classroom, request, title, contentJson = null) {
  const response = await request.post(`${api}/api/v2/publications`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`},
    data: {type: "ASSIGNMENT", status: "PUBLISHED", subjectId: classroom.subject.id,
      targetWorkspaceIds: [classroom.workspace.id], boardDate: "2020-01-01", publishAt: "2020-01-01T00:00:00Z",
      dueAt: "2020-01-02T00:00:00Z", title, content: `${title}必做`, contentJson, allowDuplicate: true},
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}
async function chooseTarget(page, dialog, name) {
  await dialog.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
  await page.getByRole("option", {name: new RegExp(name)}).click();
  await page.keyboard.press("Escape");
}

for (const refresh of [true, false]) {
test(`history reuse rejects a source moved to another date (${refresh ? "refreshed list" : "late detail read"})`, async ({classroom, request}) => {
  const source = await create(classroom, request, "改期源作业");
  const {page, context, errors} = await classroom.open("teacher");
  await page.getByRole("button", {name: "复用历史作业", exact: true}).click();
  const dialog = page.locator(".homework-reuse-dialog");
  await dialog.getByRole("checkbox", {name: "数学 · 改期源作业", exact: true}).check();
  if (!refresh) {
    // Keep the list genuinely stale even if a Socket event refreshes it. Detail
    // reads below still use the real, updated database record.
    const snapshot = await request.get(`${api}/api/v2/publications`, {headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`}});
    expect(snapshot.status()).toBe(200);
    const json = await snapshot.json();
    await context.route(/\/api\/v2\/publications(?:\?.*)?$/, route => route.fulfill({json}));
  }
  const response = await request.patch(`${api}/api/v2/publications/${source.id}`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`, "If-Match": '"1"'}, data: {boardDate: "2020-01-03"},
  });
  expect(response.status()).toBe(200);
  if (refresh) {
    await dialog.getByRole("button", {name: "刷新历史记录", exact: true}).click();
    await expect(dialog.getByRole("checkbox", {name: "数学 · 改期源作业", exact: true})).toHaveCount(0);
    await expect(dialog.getByRole("button", {name: "核对所选 0 项作业", exact: true})).toBeDisabled();
    await expect(dialog).toContainText("所选作业已不在当前日期或已不可复用");
  } else {
    await dialog.getByRole("button", {name: "核对所选 1 项作业", exact: true}).click();
    await expect(dialog).toContainText("所选作业的历史日期已变化");
  }
  await expect(dialog.locator(".publication-composer")).toHaveCount(0);
  expect((await classroom.rows()).length).toBe(1);
  expect(errors).toEqual([]);
});
}

test("batch history reuse reviews each new class and date, retains metadata and never repeats earlier successes after failure", async ({classroom, request}) => {
  const metadata = {optionalContent: "挑战题", submission: "交课代表", preparation: {text: "圆规", date: "2020-01-02"}};
  const first = await create(classroom, request, "历史甲", metadata);
  const second = await create(classroom, request, "历史乙");
  const before = await classroom.rows();
  const {page, errors} = await classroom.open("teacher");
  const target = await classroom.prisma.workspace.create({data: {
    termId: classroom.workspace.termId, gradeId: classroom.workspace.gradeId, code: "C2", name: "高一二班", type: "ADMIN_CLASS",
    subjectRules: {create: {subjectId: classroom.subject.id, deliveryMode: "ADMIN_CLASS"}},
    members: {create: {accountId: classroom.account.id, role: "TEACHER"}},
    teachingAssignments: {create: {accountId: classroom.account.id, subjectId: classroom.subject.id}},
  }});
  await page.reload();
  await expect(page.getByText("已授权 2 个教学空间", {exact: true})).toBeVisible();
  // The independent history editor must leave an existing new-publication draft alone.
  await page.locator(".publication-composer").getByLabel("正文", {exact: true}).fill("原编辑器未保存输入");
  await page.getByRole("button", {name: "复用历史作业", exact: true}).click();
  const dialog = page.locator(".homework-reuse-dialog"), date = todayBoardDate();
  await dialog.getByRole("checkbox", {name: "数学 · 历史甲", exact: true}).check();
  await dialog.getByRole("checkbox", {name: "数学 · 历史乙", exact: true}).check();
  await dialog.getByLabel("新作业板日期", {exact: true}).fill(date);
  await dialog.getByRole("button", {name: "核对所选 2 项作业", exact: true}).click();
  await expect(dialog.getByLabel("必做内容", {exact: true})).toHaveValue("历史甲必做");
  await expect(dialog.getByLabel("选做内容（可选）", {exact: true})).toHaveValue("挑战题");
  await expect(dialog.getByLabel("提交说明（可选）", {exact: true})).toHaveValue("交课代表");
  await expect(dialog.getByLabel("截止时间（可选）", {exact: true})).toHaveValue("");
  await expect(dialog.getByLabel("携带日期", {exact: true})).toHaveValue("");
  await chooseTarget(page, dialog, "高一二班");
  await dialog.getByRole("button", {name: "正式发布", exact: true}).click();
  await expect(dialog).toContainText("请重新核对截止时间和携带日期，并勾选确认");
  await dialog.getByRole("checkbox", {name: "已重新核对截止时间（可留空）和携带日期", exact: true}).check();
  await dialog.getByRole("button", {name: "正式发布", exact: true}).click();
  await expect(dialog).toContainText("请为需带物品选择有效的携带日期");
  const bringDate = shiftBoardDate(date, 1);
  await dialog.getByLabel("携带日期", {exact: true}).fill(bringDate);
  await expect(dialog.getByRole("checkbox", {name: "已重新核对截止时间（可留空）和携带日期", exact: true})).not.toBeChecked();
  await dialog.getByRole("checkbox", {name: "已重新核对截止时间（可留空）和携带日期", exact: true}).check();
  let releaseSave, saveStarted = false;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  await page.route(`${api}/api/v2/publications`, async route => {
    if (route.request().method() === "POST") { saveStarted = true; await saveGate; }
    await route.continue();
  });
  try {
    await dialog.getByRole("button", {name: "正式发布", exact: true}).click();
    await expect.poll(() => saveStarted).toBe(true);
    await expect(dialog.locator(".publication-composer")).toHaveAttribute("inert", "");
    await expect(dialog.getByTitle("关闭历史复用")).toBeDisabled();
    await expect(dialog.getByRole("button", {name: "跳过本项", exact: true})).toBeDisabled();
    releaseSave();
    await expect(dialog).toContainText("本项已发布");
  } finally { releaseSave(); }
  await page.unroute(`${api}/api/v2/publications`);
  await dialog.getByRole("button", {name: "核对下一项", exact: true}).click();
  await expect(dialog.getByLabel("正文", {exact: true})).toHaveValue("历史乙必做");
  await chooseTarget(page, dialog, "高一二班");
  await dialog.getByRole("checkbox", {name: "已重新核对截止时间（可留空）和携带日期", exact: true}).check();
  let attempts = 0;
  await page.route(`${api}/api/v2/publications`, async route => {
    if (route.request().method() === "POST" && ++attempts === 1) return route.fulfill({status: 503, json: {message: "暂时保存失败"}});
    return route.continue();
  });
  await dialog.getByRole("button", {name: "保存草稿", exact: true}).click();
  await expect(dialog).toContainText("暂时保存失败");
  await expect(dialog.getByLabel("正文", {exact: true})).toHaveValue("历史乙必做");
  expect((await classroom.rows()).length).toBe(3);
  await dialog.getByRole("button", {name: "保存草稿", exact: true}).click();
  await expect(dialog).toContainText("本项已保存为草稿");
  await dialog.getByRole("button", {name: "完成复用", exact: true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".publication-composer").getByLabel("正文", {exact: true})).toHaveValue("原编辑器未保存输入");
  const rows = await classroom.rows(), originals = rows.filter(row => [first.id, second.id].includes(row.id));
  expect(originals).toEqual(before);
  const copies = rows.filter(row => ![first.id, second.id].includes(row.id));
  expect(copies).toHaveLength(2);
  const copy = copies.find(row => row.title === "历史甲");
  expect(copy.contentJson).toEqual({...metadata, preparation: {text: "圆规", date: bringDate}});
  expect(copy.boardDate.toISOString().slice(0, 10)).toBe(date);
  expect(copy.dueAt).toBeNull(); expect(copy.revision).toBe(1); expect(copy.isCertified).toBe(true);
  expect(await classroom.prisma.publicationTarget.findMany({where: {publicationId: copy.id}, select: {workspaceId: true}})).toEqual([{workspaceId: target.id}]);
  expect(copies.find(row => row.title === "历史乙").status).toBe("DRAFT");
  expect(errors).toEqual([]);
});

test("closing a pending history read discards its late response and allows a fresh selection", async ({classroom, request}) => {
  const source = await create(classroom, request, "延迟源作业");
  const {page, context, errors} = await classroom.open("teacher");
  await page.getByRole("button", {name: "复用历史作业", exact: true}).click();
  const dialog = page.locator(".homework-reuse-dialog");
  await dialog.getByRole("checkbox", {name: "数学 · 延迟源作业", exact: true}).check();
  let release, started = false;
  const gate = new Promise(resolve => { release = resolve; });
  await context.route(`${api}/api/v2/publications/${source.id}`, async route => {
    const response = await route.fetch();
    started = true; await gate;
    await route.fulfill({response});
  });
  try {
    await dialog.getByRole("button", {name: "核对所选 1 项作业", exact: true}).click();
    await expect.poll(() => started).toBe(true);
    await dialog.getByTitle("关闭历史复用").click();
    await page.getByRole("button", {name: "结束复用", exact: true}).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", {name: "复用历史作业", exact: true}).click();
    const response = page.waitForResponse(value => value.url().endsWith(`/publications/${source.id}`));
    release(); await response;
    await expect(dialog.getByRole("button", {name: "核对所选 0 项作业", exact: true})).toBeDisabled();
    await expect(dialog.locator(".publication-composer")).toHaveCount(0);
    expect((await classroom.rows()).length).toBe(1);
    expect(errors).toEqual([]);
  } finally { release(); }
});

test("history preparation retries failed source reads, uses latest content, and requires confirmation before abandoning input", async ({classroom, request}) => {
  const source = await create(classroom, request, "源作业");
  const {page, context, errors} = await classroom.open("teacher");
  await page.getByRole("button", {name: "复用历史作业", exact: true}).click();
  const dialog = page.locator(".homework-reuse-dialog");
  await dialog.getByRole("checkbox", {name: "数学 · 源作业", exact: true}).check();
  // GET API requests pass through the PWA worker; route its network request too.
  await context.route(`${api}/api/v2/publications/${source.id}`, route => route.fulfill({status: 503, json: {message: "读取暂不可用"}}));
  await dialog.getByRole("button", {name: "核对所选 1 项作业", exact: true}).click();
  await expect(dialog).toContainText("读取暂不可用");
  expect((await classroom.rows()).length).toBe(1);
  await context.unroute(`${api}/api/v2/publications/${source.id}`);
  const response = await request.patch(`${api}/api/v2/publications/${source.id}`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`, "If-Match": '"1"'}, data: {content: "刚更新的正文"},
  });
  expect(response.status()).toBe(200);
  await dialog.getByRole("button", {name: "核对所选 1 项作业", exact: true}).click();
  await expect(dialog.getByLabel("正文", {exact: true})).toHaveValue("刚更新的正文");
  await dialog.getByTitle("关闭历史复用").click();
  await page.getByRole("button", {name: "取消", exact: true}).last().click();
  await expect(dialog.getByLabel("正文", {exact: true})).toHaveValue("刚更新的正文");
  await dialog.getByRole("button", {name: "跳过本项", exact: true}).click();
  await page.getByRole("dialog").filter({hasText: "跳过这项作业？"}).getByRole("button", {name: "跳过本项", exact: true}).click();
  await dialog.getByRole("button", {name: "完成复用", exact: true}).click();
  await expect(dialog).not.toBeVisible();
  expect((await classroom.rows()).length).toBe(1);
  expect(errors).toEqual([]);
});
