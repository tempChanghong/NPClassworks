import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";

for (const pending of [false, true]) {
  test(`correction review invalidates ${pending ? 'an in-flight response after another edit' : 'displayed records after withdrawal'}`, async ({browser, request}) => {
    await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
    await request.post(`${api}/__test/reset`);
    await request.post(`${api}/api/v2/publications`, {data: {content: "第一版正文", boardDate: preparationToday()}});
    await request.patch(`${api}/api/v2/publications/pub-1`, {headers: {"If-Match": '"1"'}, data: {content: "第二版正文"}});
    const values = {"classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: "screen"}),
      "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true}), "classworks-v2-screen-token": "screen-token"};
    const context = await browser.newContext({serviceWorkers: "block", storageState: {cookies: [], origins: [
      {origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))},
    ]}});
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    let release, started = false, latest = false;
    const gate = new Promise(resolve => { release = resolve; });
    try {
      await page.route(`${api}/api/v2/classroom-screens/feed/pub-1/corrections?*`, async route => {
        const revision = latest ? 3 : 2;
        started = true;
        if (pending && !latest) await gate;
        await route.fulfill({json: {success: true, data: {items: [{revision, changedAt: new Date().toISOString(),
          before: {content: "第一版正文"}, after: {content: revision === 2 ? "第二版正文" : "第三版正文"}}], nextBeforeRevision: null}}});
      });
      await page.goto(origin);
      await expect(page.locator(".publication-content")).toContainText("第二版正文");
      await page.getByTitle("更多", {exact: true}).click();
      await page.getByText("查看今日更正", {exact: true}).click();
      await expect.poll(() => started).toBe(true);
      const dialog = page.locator(".homework-corrections-dialog");
      if (!pending) await expect(dialog.locator(".correction-entry")).toHaveCount(1);
      const changedFeed = page.waitForResponse(async response => {
        if (!response.url().includes("/classroom-screens/feed?") || !response.ok()) return false;
        try { return (await response.json()).data.items.some(item => item.revision === 3); } catch { return false; }
      });
      await request.patch(`${api}/api/v2/publications/pub-1`, {headers: {"If-Match": '"2"'}, data: pending ? {content: "第三版正文"} : {status: "WITHDRAWN"}});
      await changedFeed;
      await expect(dialog).toContainText("作业已变化");
      release(); latest = true;
      await expect(dialog.locator(".correction-entry")).toHaveCount(0);
      await dialog.getByRole("button", {name: "刷新更正", exact: true}).click();
      if (pending) await expect(dialog).toContainText("第三版正文");
      else await expect(dialog).toContainText("暂无可展示的更正记录");
      expect(errors).toEqual([]);
    } finally { release(); await context.close(); }
  });
}
