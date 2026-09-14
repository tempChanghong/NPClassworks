import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";
import {shiftBoardDate} from "../../src/utils/boardDate.js";

for (const role of ["screen", "student"]) {
  test(`${role} tomorrow checklist rejects failed refreshes and late responses and expires across midnight`, async ({browser, request}, testInfo) => {
    await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
    await request.post(`${api}/__test/reset`);
    await request.post(`${api}/api/v2/publications`, {data: {content: "作业板就绪", boardDate: preparationToday()}});
    const values = {"classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
      ...(role === "screen" ? {"classworks-v2-screen-token": "screen-token", "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true})}
        : {"classworks-v2-student-selection": JSON.stringify({schoolId: "school", administrativeClassId: "class-a", administrativeClassName: "高一一班", courseGroupIds: {}, declinedSubjectIds: []})})};
    const context = await browser.newContext({serviceWorkers: "block", timezoneId: "Asia/Shanghai", viewport: {width: 1440, height: 1000},
      storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}});
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const fixed = new Date(`${preparationToday()}T12:00:00+08:00`), tomorrow = shiftBoardDate(preparationToday(fixed), 1);
    let fail = false, mixed = false, publishDuringRequest = false, hold = false, entered = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    try {
      await page.clock.setFixedTime(fixed);
      await page.goto(origin);
      await expect(page.locator(".publication-content")).toContainText("作业板就绪");
      await page.route("**/api/v2/**/feed?**", async route => {
        const params = new URL(route.request().url()).searchParams;
        if (params.has("weekStart")) {
          if (fail) return route.fulfill({status: 503, json: {message: "清单服务暂不可用"}});
          const delayed = hold;
          if (delayed) { entered = true; await gate; }
          const publishAt = publishDuringRequest ? new Date(fixed.getTime() + 10_000).toISOString() : null;
          if (publishDuringRequest) await page.clock.setFixedTime(new Date(fixed.getTime() + 20_000));
          return route.fulfill({json: {data: {weekStart: params.get("weekStart"), weekView: "due", total: 1, items: [{
            id: "due", revision: 1, type: "ASSIGNMENT", status: "PUBLISHED", content: delayed ? "旧请求不应显示" : "明天上交练习册",
            boardDate: shiftBoardDate(tomorrow, -30), dueAt: `${tomorrow}T07:30:00+08:00`, publishAt, subject: {name: "数学"}, isCertified: true,
            targets: [{workspaceId: "class-a", workspace: {name: "高一一班"}}], contentJson: {submission: "交课代表"},
          }]}}});
        }
        return route.fulfill({json: {data: {boardDate: params.get("boardDate"), includesPreparations: true, total: mixed ? 1 : 0,
          items: mixed ? [{id: "due", revision: 2, type: "ASSIGNMENT", status: "PUBLISHED", boardDate: params.get("boardDate"), dueAt: null,
            content: "另一个版本未设截止", targets: [{workspaceId: "class-a"}]}] : [], nextAfterId: null,
          generatedAt: new Date().toISOString()}}});
      });
      const button = page.getByRole("button", {name: "明日要交与需带", exact: true}), dialog = page.locator(".homework-tomorrow-dialog");
      await button.click();
      await expect(dialog.locator(".tomorrow-due")).toContainText("明天上交练习册");
      await expect(dialog).toBeVisible();
      await page.screenshot({path: testInfo.outputPath("tomorrow-checklist.png"), animations: "disabled"});
      publishDuringRequest = true;
      await dialog.getByRole("button", {name: "刷新核对清单", exact: true}).click();
      await expect(dialog.locator(".tomorrow-due")).toContainText("明天上交练习册");
      publishDuringRequest = false;
      fail = true;
      await dialog.getByRole("button", {name: "刷新核对清单", exact: true}).click();
      await expect(dialog).toContainText("清单服务暂不可用");
      await expect(dialog.locator(".tomorrow-row")).toHaveCount(0);
      await expect(dialog.getByRole("button", {name: "打印作业清单", exact: true})).toHaveCount(0);
      fail = false; mixed = true;
      await dialog.getByRole("button", {name: "刷新核对清单", exact: true}).click();
      await expect(dialog).toContainText("作业版本发生变化");
      await expect(dialog.locator(".tomorrow-row")).toHaveCount(0);
      await expect(dialog.getByRole("button", {name: "打印作业清单", exact: true})).toHaveCount(0);
      mixed = false; hold = true;
      await dialog.getByRole("button", {name: "刷新核对清单", exact: true}).click();
      await expect.poll(() => entered).toBe(true);
      await dialog.getByRole("button", {name: "关闭", exact: true}).click();
      hold = false;
      await button.click();
      await expect(dialog).toContainText("明天上交练习册");
      release();
      await expect(dialog).not.toContainText("旧请求不应显示");
      await page.clock.setFixedTime(new Date(`${tomorrow}T00:01:00+08:00`));
      await page.evaluate(() => document.dispatchEvent(new window.Event("visibilitychange")));
      await expect(dialog).toContainText("日期已变化");
      await expect(dialog.getByRole("button", {name: "打印作业清单", exact: true})).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally { release(); await context.close(); }
  });
}
