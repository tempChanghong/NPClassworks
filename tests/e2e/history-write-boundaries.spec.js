import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

async function openHistory(browser, request, status = "PUBLISHED") {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  await request.post(`${api}/api/v2/publications`, {data: {content: "历史写入边界测试"}});
  await request.post(`${api}/__test/history`);
  // A screen edit makes the current version eligible for teacher confirmation.
  await request.patch(`${api}/api/v2/publications/pub-1`, {headers: {"If-Match": '"45"'}, data: {isCertified: false, status}});
  const values = {"classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: "teacher"}),
    "classworks-v2-access-token": "teacher-token", "classworks-v2-refresh-token": "teacher-refresh"};
  const context = await browser.newContext({serviceWorkers: "block", storageState: {cookies: [], origins: [
    {origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))},
  ]}});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole("button").filter({has: page.locator(".mdi-dots-vertical")}).click();
  await page.getByText("版本历史与恢复", {exact: true}).click();
  const dialog = page.getByRole("dialog").filter({hasText: "不可删除的版本历史"});
  await expect(dialog.locator(".v-timeline-item")).toHaveCount(20);
  return {context, page, dialog, errors};
}

for (const status of ["DRAFT", "WITHDRAWN"]) {
  test(`history does not offer teacher confirmation for an uncertified ${status}`, async ({browser, request}) => {
    const s = await openHistory(browser, request, status);
    try {
      await expect(s.dialog.getByRole("button", {name: "教师确认当前版本", exact: true})).toHaveCount(0);
      // History remains accessible, including restoring earlier published content.
      await expect(s.dialog.getByRole("button", {name: "恢复此版本", exact: true}).first()).toBeEnabled();
      await s.dialog.getByRole("button", {name: "加载更早版本", exact: true}).click();
      await expect(s.dialog.locator(".v-timeline-item")).toHaveCount(40);
      expect(s.errors).toEqual([]);
    } finally { await s.context.close(); }
  });
}

for (const operation of ["restore", "certify"]) {
  test(`history ${operation} serializes writes and blocks reload until a rejected request settles`, async ({browser, request}) => {
    const s = await openHistory(browser, request);
    let release, started = false, writes = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const reloadPrevented = () => s.page.evaluate(() => {
      const event = new window.Event("beforeunload", {cancelable: true});
      window.dispatchEvent(event); return event.defaultPrevented;
    });
    try {
      expect(await reloadPrevented()).toBe(false);
      await s.page.route(`${api}/api/v2/publications/pub-1/${operation}`, async route => {
        writes++; started = true; await gate;
        return route.fulfill({status: 503, json: {message: "历史写入暂时失败"}});
      });
      const restores = s.dialog.getByRole("button", {name: "恢复此版本", exact: true});
      const certify = s.dialog.getByRole("button", {name: "教师确认当前版本", exact: true});
      await (operation === "restore" ? restores.first() : certify).click();
      await expect.poll(() => started).toBe(true);
      await expect(restores.nth(1)).toBeDisabled();
      await expect(certify).toBeDisabled();
      expect(await reloadPrevented()).toBe(true);
      await expect(s.dialog.getByRole("button", {name: "关闭", exact: true})).toBeDisabled();
      await s.page.keyboard.press("Escape");
      await expect(s.dialog).toBeVisible();
      release();
      await expect(s.dialog).toContainText("历史写入暂时失败");
      await expect(restores.nth(1)).toBeEnabled();
      await expect(certify).toBeEnabled();
      expect(await reloadPrevented()).toBe(false);
      expect(writes).toBe(1);
      await s.page.unroute(`${api}/api/v2/publications/pub-1/${operation}`);
      await restores.first().click();
      await expect(s.dialog.getByText("版本 47", {exact: true})).toBeVisible();
      expect(await reloadPrevented()).toBe(false);
      expect(s.errors).toEqual([]);
      await s.dialog.getByRole("button", {name: "关闭", exact: true}).click();
      expect(await reloadPrevented()).toBe(false);
    } finally { release(); await s.context.close(); }
  });
}
