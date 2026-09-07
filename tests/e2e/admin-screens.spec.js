import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

// Production Vue page and real buttons, with explicit admin API fixtures.
// Backend authorization remains covered by the separate backend integration tests.
async function openAdmin(browser, width, role = "ADMIN") {
  const context = await browser.newContext({viewport: {width, height: 1000}, serviceWorkers: "block",
    storageState: {cookies: [], origins: [{origin, localStorage: [
      {name: "classworks-v2-access-token", value: "admin-token"},
      {name: "classworks-v2-refresh-token", value: "admin-refresh"},
      {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "teacher"})},
    ]}]}});
  const writes = [], errors = [];
  const school = {id: "school", name: "测试学校", code: "E2E", terms: [{id: "term", name: "当前学期", status: "ACTIVE"}]};
  const classroom = {id: "class-a", name: "一班", code: "C1", type: "ADMIN_CLASS", members: [], pendingInvitations: []};
  let devices = [{id: "screen-a", name: "一班大屏", loginCode: "class-a", administrativeClassId: "class-a",
    administrativeClass: classroom, isActive: true, dutyState: "ONLINE"}];
  const reply = (route, data) => route.fulfill({json: {data}});
  await context.route(`${api}/accounts/local/status`, r => reply(r, {bootstrapRequired: false}));
  await context.route(url => url.origin === api && url.pathname === "/api/v2/me/schools", r => reply(r, [{role, school}]));
  await context.route(`${api}/api/v2/admin/**`, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() !== "GET") {
      const body = req.postDataJSON(); writes.push({path, method: req.method(), body});
      if (path.endsWith("classroom-screen-accounts")) {
        devices.push({id: "new-screen", ...body, administrativeClass: classroom, isActive: true, dutyState: "NOT_ACTIVATED"});
        return reply(route, devices.at(-1));
      }
      if (req.method() === "PATCH") devices = devices.map(d => path.endsWith(d.id) ? {...d, ...body} : d);
      return reply(route, {});
    }
    if (path.endsWith("/classroom-screens")) return reply(route, devices);
    if (path.endsWith("/workspace-memberships")) return reply(route, {workspaces: [classroom]});
    if (path.endsWith("/local-accounts")) return reply(route, []);
    if (path.endsWith("/homework-settings")) return reply(route, {});
    return route.fulfill({status: 404, json: {message: `Unconfigured admin fixture: ${path}`}});
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/classworks-admin?section=screens&school=school&term=term`);
  return {context, page, writes, errors};
}

for (const width of [1440, 540]) {
  test(`screen admin preserves create, edit, guard and responsive actions at ${width}px`, async ({browser}) => {
    const {context, page, writes, errors} = await openAdmin(browser, width);
    try {
      const row = page.locator('.admin-entity-list .v-list-item').filter({has: page.locator('.v-list-item-title', {hasText: '一班大屏'})});
      await expect(row).toBeVisible();
      if (width > 959) {
        await expect(row.locator('.admin-row-actions--desktop')).toBeVisible();
        await expect(row.locator('.admin-row-actions--mobile')).toBeHidden();
        await row.getByRole("button", {name: "编辑", exact: true}).click();
      } else {
        await expect(row.locator('.admin-row-actions--desktop')).toBeHidden();
        await row.getByRole("button", {name: "大屏操作"}).click();
        await page.getByText("编辑账号", {exact: true}).click();
      }
      const edit = page.getByRole("dialog");
      await expect(edit).toBeVisible();
      await edit.getByLabel("设备名称", {exact: true}).fill("一班新大屏");
      await edit.getByRole("button", {name: "保存", exact: true}).click();
      await expect(edit).toBeHidden();
      expect(writes[0].body).toEqual({name: "一班新大屏", loginCode: "class-a", administrativeClassId: "class-a"});
      await expect(page.locator('.admin-entity-list')).toContainText("一班新大屏");
      await page.getByLabel("设备名称", {exact: true}).fill("新设备");
      await page.getByRole("button", {name: "返回教师工作台"}).click();
      const guard = page.getByRole("dialog");
      await expect(guard).toContainText("放弃未保存的修改？");
      await guard.getByRole("button", {name: "取消", exact: true}).click();
      await expect(page.getByLabel("设备名称", {exact: true})).toHaveValue("新设备");
      await page.getByLabel("大屏短账号", {exact: true}).fill("new-screen");
      await page.getByLabel("大屏 PIN", {exact: true}).fill("1234");
      await page.locator(".v-select").filter({hasText: "绑定行政班"}).getByRole("combobox").first().click();
      await page.getByRole("option", {name: "一班 · C1"}).click();
      await page.getByRole("button", {name: "创建账号", exact: true}).click();
      await expect(page.getByLabel("设备名称", {exact: true})).toHaveValue("");
      await expect(page.locator('.admin-entity-list')).toContainText("新设备");
      expect(writes.at(-1).body).toEqual({name: "新设备", loginCode: "new-screen", pin: "1234", administrativeClassId: "class-a"});
      await page.getByLabel("搜索设备、账号或班级", {exact: true}).fill("new-screen");
      await expect(page.locator('.admin-entity-list .v-list-item')).toHaveCount(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test("screen admin retains the manager-only UI boundary", async ({browser}) => {
  const {context, page, writes, errors} = await openAdmin(browser, 1440, "TEACHER");
  try {
    await expect(page.getByText("请先完成学校初始化或取得 OWNER/ADMIN 权限。", {exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: "创建账号", exact: true})).toHaveCount(0);
    await expect(page.getByLabel("搜索设备、账号或班级", {exact: true})).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
