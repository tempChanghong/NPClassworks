import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

test.use({serviceWorkers: "block", storageState: {cookies: [], origins: [{origin, localStorage: [
  {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "teacher"})},
  {name: "classworks-v2-access-token", value: "teacher-token"},
  {name: "classworks-v2-refresh-token", value: "teacher-refresh"},
]}]}});

test("teacher search and action filters include later pages and retain complete results on refresh failure", async ({page, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  const base = (await (await request.post(`${api}/api/v2/publications`, {data: {content: "模板作业"}})).json()).data;
  const publications = Array.from({length: 101}, (_, i) => ({...base, id: `p-${i}`,
    title: i === 100 ? "最后一页的唯一作业" : `作业${i}`}));
  const actions = Array.from({length: 151}, (_, i) => ({id: `a-${i}`, severity: "WARNING", changedFields: [],
    reason: i === 150 ? "CREATED_BY_SCREEN" : "CHANGED_AFTER_CERTIFICATION",
    publication: {...base, id: `a-${i}`, content: i === 150 ? "最后一页的大屏新录入" : `待处理作业${i}`}}));
  const summary = {total: 151, changedAfterCertified: 150, createdByScreen: 1, other: 0, overdue: 0, dueSoon: 0};
  const pageRequests = {publications: [], actions: []};
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // Connection timing varies between local runs and CI. Hold the initial Socket.IO
  // handshake so bootstrap and the legitimate connect refresh can be checked separately.
  let connect;
  const connectionGate = new Promise(resolve => { connect = resolve; });
  await page.route(`${api}/socket.io/**`, async route => {
    await connectionGate;
    await route.continue();
  });
  let fail = false;
  for (const [path, key, items] of [["/publications", "publications", publications], ["/publications/action-required", "actions", actions]]) {
    await page.route(`${api}/api/v2${path}?*`, async route => {
      const query = new URL(route.request().url()).searchParams;
      const skip = Number(query.get("skip") || 0);
      const limit = Number(query.get("limit") || 20);
      pageRequests[key].push(skip);
      if (fail && skip > 0) return route.fulfill({status: 503, json: {message: "后续页面暂不可用"}});
      await route.fulfill({json: {data: {items: items.slice(skip, skip + limit), total: items.length, limit, skip,
        ...(key === "actions" ? {summary} : {})}}});
    });
  }
  try {
    await page.goto(origin);
    const manager = page.locator(".teacher-publication-manager");
    await expect(manager).toContainText("101 / 101");
    await manager.getByRole("textbox", {name: "搜索标题、正文、科目或班级"}).fill("最后一页的唯一作业");
    await expect(manager.locator(".publication-list-item")).toHaveCount(1);
    await expect(manager).toContainText("1 / 101");
    const center = page.locator(".teacher-action-center");
    await center.locator(".v-chip").filter({hasText: /^大屏新录入 1$/}).click();
    await expect(center.locator(".action-item")).toHaveCount(1);
    await expect(center).toContainText("最后一页的大屏新录入");
    expect(pageRequests.publications).toEqual([0, 100]);
    expect(pageRequests.actions).toEqual([0, 100]);
    connect();
    await expect.poll(() => pageRequests.publications).toEqual([0, 100, 0, 100]);
    await expect.poll(() => pageRequests.actions).toEqual([0, 100, 0, 100]);
    await expect(manager.getByTitle("刷新发布记录")).not.toHaveClass(/v-btn--loading/);
    await expect(center.getByTitle("刷新待处理事项")).not.toHaveClass(/v-btn--loading/);
    await expect(manager).toContainText("1 / 101");
    await expect(center).toContainText("最后一页的大屏新录入");
    fail = true;
    const publicationRequestsBeforeFailure = pageRequests.publications.length;
    await manager.getByTitle("刷新发布记录").click();
    await expect.poll(() => pageRequests.publications.slice(publicationRequestsBeforeFailure)).toEqual([0, 100]);
    await expect(page.getByText("后续页面暂不可用", {exact: true})).toBeVisible();
    await expect(manager).toContainText("1 / 101");
    const actionRequestsBeforeFailure = pageRequests.actions.length;
    await center.getByTitle("刷新待处理事项").click();
    await expect.poll(() => pageRequests.actions.slice(actionRequestsBeforeFailure)).toEqual([0, 100]);
    await expect(center.getByTitle("刷新待处理事项")).not.toHaveClass(/v-btn--loading/);
    await expect(center).toContainText("最后一页的大屏新录入");
    expect(errors).toEqual([]);
  } finally { connect(); }
});
