import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";
import {todayBoardDate} from "../../src/utils/boardDate.js";

async function openScreen(browser) {
  const values = {"classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: "screen"}),
    "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true}), "classworks-v2-screen-token": "screen-token"};
  const context = await browser.newContext({serviceWorkers: "block", storageState: {cookies: [], origins: [
    {origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))},
  ]}});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin);
  await expect(page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
  return {page, context, errors};
}
async function seed(request) {
  const response = await request.post(`${api}/api/v2/publications`, {data: {subjectId: "math", targetWorkspaceIds: ["class-a"],
    type: "ASSIGNMENT", boardDate: todayBoardDate(), content: "原始正文"}});
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}
const textBox = page => page.getByRole("textbox", {name: "作业内容 作业内容", exact: true});

test("converting no-homework to actual homework clears the marker before sending optional content", async ({browser, request}) => {
  await request.post(`${api}/api/v2/publications`, {data: {
    subjectId: "math", targetWorkspaceIds: ["class-a"], type: "ASSIGNMENT", boardDate: todayBoardDate(),
    title: "今日无作业", content: "本日该科目无作业。", contentJson: {kind: "NO_HOMEWORK", version: 1},
  }});
  const s = await openScreen(browser), dialog = s.page.locator(".screen-composer");
  try {
    await s.page.getByRole("button", {name: "修改", exact: true}).click();
    await dialog.getByLabel("选做内容（可选）", {exact: true}).fill("挑战题");
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog).toContainText("请先将“今日无作业”改为实际作业内容");
    await dialog.getByLabel("必做内容", {exact: true}).fill("完成第一题");
    await dialog.getByLabel("标题（可选）", {exact: true}).fill("数学练习");
    const write = s.page.waitForRequest(r => r.method() === "PATCH" && r.url().includes("/classroom-screens/publications/"));
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    expect((await write).postDataJSON().contentJson).toEqual({optionalContent: "挑战题"});
    await expect(dialog).not.toBeVisible();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("an invalid draft deadline keeps optional and preparation input recoverable without render errors", async ({browser}) => {
  const s = await openScreen(browser), dialog = s.page.locator(".screen-composer");
  try {
    await s.page.evaluate(date => localStorage.setItem("classworks-v2-screen-homework-draft:screen-a:new", JSON.stringify({
      subjectId: "math", targetWorkspaceId: "class-a", content: "保留必做", optionalContent: "保留选做",
      materials: "圆规", materialsDate: date, boardDate: date, dueAt: "invalid-date", updatedAt: Date.now(),
    })), todayBoardDate());
    await s.page.getByRole("button", {name: "录入作业", exact: true}).first().click();
    await expect(dialog.getByLabel("选做内容（可选）", {exact: true})).toHaveValue("保留选做");
    expect(s.errors).toEqual([]);
    await s.context.setOffline(true);
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog).toContainText("截止时间无效");
    await expect(dialog.getByLabel("需带物品（可选）", {exact: true})).toHaveValue("圆规");
    await dialog.getByRole("button", {name: "清除", exact: true}).click();
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog).not.toBeVisible();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("conflict copies reject empty required input before entering the offline queue", async ({browser, request}) => {
  const row = await seed(request), s = await openScreen(browser), dialog = s.page.locator(".screen-composer");
  try {
    await s.page.getByRole("button", {name: "修改", exact: true}).click();
    await textBox(s.page).fill("本机修改");
    expect((await request.patch(`${api}/api/v2/publications/${row.id}`, {headers: {"If-Match": '"1"'}, data: {content: "教师新版本"}})).status()).toBe(200);
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog.getByRole("button", {name: "另存为一项新作业", exact: true})).toBeVisible();
    await textBox(s.page).fill("");
    await dialog.getByLabel("选做内容（可选）", {exact: true}).fill("仍保留的选做");
    await s.context.setOffline(true);
    await dialog.getByRole("button", {name: "另存为一项新作业", exact: true}).click();
    await expect(dialog).toContainText("标题和作业内容不能同时为空");
    const queue = await s.page.evaluate(() => JSON.parse(localStorage.getItem("classworks-v2-screen-publication-queue:screen-a") || "[]"));
    expect(queue).toEqual([]);
    await expect(dialog.getByLabel("选做内容（可选）", {exact: true})).toHaveValue("仍保留的选做");
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("screen optional homework and preparation survive drafts, validate dates and can be cleared without losing teacher instructions", async ({browser, request}) => {
  const row = await seed(request);
  const endpoint = `${api}/api/v2/publications/${row.id}`;
  expect((await request.patch(endpoint, {headers: {"If-Match": '"1"'}, data: {
    contentJson: {submission: "交给课代表", optionalContent: "教师选做", preparation: {text: "教师物品", date: todayBoardDate()}},
  }})).status()).toBe(200);
  const s = await openScreen(browser), dialog = s.page.locator(".screen-composer");
  try {
    await s.page.evaluate(({id, date}) => localStorage.setItem(`classworks-v2-screen-homework-draft:screen-a:${id}`, JSON.stringify({
      subjectId: "math", targetWorkspaceId: "class-a", content: "旧版草稿正文", boardDate: date,
      baseRevision: 2, updatedAt: Date.now(),
    })), {id: row.id, date: todayBoardDate()});
    await s.page.getByRole("button", {name: "修改", exact: true}).click();
    await expect(dialog).toContainText("已自动恢复");
    await expect(dialog.getByLabel("选做内容（可选）", {exact: true})).toHaveValue("教师选做");
    await expect(dialog.getByLabel("需带物品（可选）", {exact: true})).toHaveValue("教师物品");
    await dialog.getByLabel("选做内容（可选）", {exact: true}).fill("本机挑战题");
    await dialog.getByLabel("需带物品（可选）", {exact: true}).fill("圆规和直尺");
    await dialog.getByLabel("携带日期", {exact: true}).fill("");
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog).toContainText("有效的携带日期");
    await dialog.getByRole("button", {name: "取消", exact: true}).click();
    await s.page.reload();
    await s.page.getByRole("button", {name: "修改", exact: true}).click();
    await expect(dialog).toContainText("已自动恢复");
    await expect(dialog.getByLabel("选做内容（可选）", {exact: true})).toHaveValue("本机挑战题");
    await expect(dialog.getByLabel("需带物品（可选）", {exact: true})).toHaveValue("圆规和直尺");
    await dialog.getByLabel("携带日期", {exact: true}).fill(todayBoardDate());
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog).not.toBeVisible();
    const read = async () => (await (await request.get(endpoint)).json()).data;
    expect((await read()).contentJson).toEqual({submission: "交给课代表", optionalContent: "本机挑战题", preparation: {text: "圆规和直尺", date: todayBoardDate()}});
    await s.page.getByRole("button", {name: "修改", exact: true}).click();
    // Wait for the reopened controls to finish receiving the saved values before
    // clearing them; fill("") on a still-empty textarea can dispatch no input.
    await expect(dialog.getByLabel("选做内容（可选）", {exact: true})).toHaveValue("本机挑战题");
    await expect(dialog.getByLabel("需带物品（可选）", {exact: true})).toHaveValue("圆规和直尺");
    await dialog.getByLabel("选做内容（可选）", {exact: true}).fill("");
    await dialog.getByLabel("需带物品（可选）", {exact: true}).fill("");
    await expect(dialog.getByLabel("需带物品（可选）", {exact: true})).toHaveValue("");
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog).not.toBeVisible();
    expect((await read()).contentJson).toEqual({submission: "交给课代表"});
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("screen conflict applies editable metadata while retaining latest submission instructions", async ({browser, request}) => {
  const row = await seed(request), s = await openScreen(browser), dialog = s.page.locator(".screen-composer");
  const endpoint = `${api}/api/v2/publications/${row.id}`;
  try {
    await s.page.getByRole("button", {name: "修改", exact: true}).click();
    await dialog.getByLabel("选做内容（可选）", {exact: true}).fill("本机选做");
    await dialog.getByLabel("需带物品（可选）", {exact: true}).fill("直尺");
    await dialog.getByLabel("携带日期", {exact: true}).fill(todayBoardDate());
    expect((await request.patch(endpoint, {headers: {"If-Match": '"1"'}, data: {
      contentJson: {submission: "最新提交说明", optionalContent: "服务器选做"},
    }})).status()).toBe(200);
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog.locator(".screen-conflict-comparison")).toContainText("本机选做");
    await dialog.getByRole("button", {name: "以本机输入生成新版本", exact: true}).click();
    await s.page.getByRole("button", {name: "保存新版本", exact: true}).click();
    await expect(dialog).not.toBeVisible();
    const saved = (await (await request.get(endpoint)).json()).data;
    expect(saved.contentJson).toEqual({submission: "最新提交说明", optionalContent: "本机选做", preparation: {text: "直尺", date: todayBoardDate()}});
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test("screen offline creation replays optional homework and preparation", async ({browser, request}) => {
  const s = await openScreen(browser), dialog = s.page.locator(".screen-composer");
  try {
    await s.page.getByRole("button", {name: "录入作业", exact: true}).first().click();
    await s.page.getByRole("button", {name: "数学", exact: true}).click();
    await textBox(s.page).fill("离线必做");
    await dialog.getByLabel("选做内容（可选）", {exact: true}).fill("离线选做");
    await dialog.getByLabel("需带物品（可选）", {exact: true}).fill("实验材料");
    await dialog.getByLabel("携带日期", {exact: true}).fill(todayBoardDate());
    await s.context.setOffline(true);
    await dialog.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(dialog).not.toBeVisible();
    await s.context.setOffline(false);
    await expect.poll(async () => {
      const data = (await (await request.get(`${api}/api/v2/publications`)).json()).data;
      return data.items.find(item => item.content === "离线必做")?.contentJson;
    }).toEqual({optionalContent: "离线选做", preparation: {text: "实验材料", date: todayBoardDate()}});
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});
test.beforeEach(async ({request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
});

for (const [edit, reject] of [[false, false], [true, false], [false, true], [true, true]]) {
  test(`screen ${edit ? "edit" : "creation"} freezes input during save (${reject ? "rejection and retry" : "success"})`, async ({browser, request}) => {
    const row = edit ? await seed(request) : null;
    const s = await openScreen(browser);
    let release, started = false;
    const gate = new Promise(resolve => { release = resolve; });
    const endpoint = `${api}/api/v2/classroom-screens/publications${row ? `/${row.id}` : ""}`;
    try {
      if (edit) await s.page.getByRole("button", {name: "修改", exact: true}).click();
      else {
        await s.page.getByRole("button", {name: "录入作业", exact: true}).first().click();
        await s.page.getByRole("button", {name: "数学", exact: true}).click();
      }
      await textBox(s.page).fill("本次提交正文");
      await s.page.route(endpoint, async route => {
        if (["POST", "PATCH"].includes(route.request().method()) && !started) {
          started = true; await gate;
          if (reject) return route.fulfill({status: 422, json: {message: "测试保存失败"}});
        }
        return route.continue();
      });
      await s.page.getByRole("button", {name: "保存作业", exact: true}).click();
      await expect.poll(() => started).toBe(true);
      // Even if a focused text input attempts to regain focus, later typing must
      // not be accepted while the submitted snapshot is being saved.
      await textBox(s.page).evaluate(el => el.focus());
      await s.page.keyboard.type("不会被保存的追加");
      await expect(textBox(s.page)).toHaveValue("本次提交正文");
      release();
      if (reject) {
        await expect(s.page.locator(".screen-composer")).toContainText("测试保存失败");
        await textBox(s.page).fill("失败后重新编辑正文");
        await s.page.getByRole("button", {name: "保存作业", exact: true}).click();
      }
      await expect(s.page.locator(".screen-composer")).not.toBeVisible();
      await expect(s.page.getByText(reject ? "失败后重新编辑正文" : "本次提交正文", {exact: true}).first()).toBeVisible();
      expect(s.errors).toEqual([]);
    } finally { release(); await s.context.close(); }
  });
}

test("a second screen conflict followed by a failed latest read keeps input and offers recovery without page errors", async ({browser, request}) => {
  const row = await seed(request), s = await openScreen(browser);
  const endpoint = `${api}/api/v2/classroom-screens/publications/${row.id}`;
  let failRead = false;
  try {
    await s.page.route(endpoint, route => route.request().method() === "GET" && failRead
      ? route.fulfill({status: 503, json: {message: "最新版暂时无法读取"}}) : route.continue());
    await s.page.getByRole("button", {name: "修改", exact: true}).click();
    await textBox(s.page).fill("本机需保留的正文");
    const update = (revision, content) => request.patch(`${api}/api/v2/publications/${row.id}`, {headers: {"If-Match": `"${revision}"`}, data: {content}});
    expect((await update(1, "服务器第二版")).status()).toBe(200);
    await s.page.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(s.page.getByRole("button", {name: "以本机输入生成新版本", exact: true})).toBeVisible();
    expect((await update(2, "服务器第三版")).status()).toBe(200);
    failRead = true;
    await s.page.getByRole("button", {name: "以本机输入生成新版本", exact: true}).click();
    const failed = s.page.waitForResponse(r => r.url() === endpoint && r.request().method() === "GET" && r.status() === 503);
    await s.page.getByRole("button", {name: "保存新版本", exact: true}).click();
    await failed;
    await expect(s.page.locator(".screen-composer")).toContainText("最新版暂时无法读取");
    await expect(textBox(s.page)).toHaveValue("本机需保留的正文");
    expect(s.errors).toEqual([]);
    failRead = false;
    await expect(s.page.getByRole("button", {name: "以本机输入生成新版本", exact: true})).not.toBeVisible();
    await s.page.getByRole("button", {name: "放弃本机输入并载入最新版", exact: true}).click();
    await s.page.getByRole("button", {name: "载入最新版", exact: true}).click();
    await expect(textBox(s.page)).toHaveValue("服务器第三版");
    await textBox(s.page).fill("核对后重新保存");
    await s.page.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(s.page.locator(".screen-composer")).not.toBeVisible();
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});
