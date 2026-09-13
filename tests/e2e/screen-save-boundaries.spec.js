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
