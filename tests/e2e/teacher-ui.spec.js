import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

const storageState = {cookies: [], origins: [{origin, localStorage: [
  {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "teacher"})},
  {name: "classworks-v2-access-token", value: "teacher-token"},
  {name: "classworks-v2-refresh-token", value: "teacher-refresh"},
]}]};

test.beforeEach(async ({request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
});

test("teacher mobile switches tasks without discarding an unsaved publication", async ({browser}) => {
  const context = await browser.newContext({
    viewport: {width: 390, height: 844}, serviceWorkers: "block", storageState,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(origin);
    const nav = page.locator(".teacher-task-nav");
    const center = page.locator(".teacher-action-center");
    const composer = page.locator(".publication-composer");
    const manager = page.locator(".teacher-publication-manager");
    await expect(nav).toBeVisible();
    await expect(center).toBeVisible();
    await expect(manager).toBeVisible();
    await expect(composer).toBeHidden();

    await nav.getByRole("button", {name: "新建发布"}).click();
    await expect(composer).toBeVisible();
    await expect(manager).toBeHidden();
    const body = composer.getByRole("textbox", {name: "正文 正文", exact: true});
    await body.fill("未提交的课堂作业内容");
    await nav.getByRole("button", {name: "发布记录"}).click();
    await expect(manager).toBeVisible();
    await nav.getByRole("button", {name: "新建发布"}).click();
    await expect(body).toHaveValue("未提交的课堂作业内容");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("teacher mobile opens record editing in the composer", async ({browser, request}) => {
  const saved = await request.post(`${api}/api/v2/publications`, {
    data: {title: "待改作业", content: "原始正文", boardDate: "2026-10-03"},
  });
  expect(saved.ok()).toBe(true);
  const context = await browser.newContext({
    viewport: {width: 390, height: 844}, serviceWorkers: "block", storageState,
  });
  const page = await context.newPage();
  try {
    await page.goto(origin);
    const manager = page.locator(".teacher-publication-manager");
    const nav = page.locator(".teacher-task-nav");
    await expect(manager).toContainText("待改作业");
    await nav.getByRole("button", {name: "新建发布"}).click();
    const body = page.locator(".publication-composer").getByRole("textbox", {name: "正文 正文", exact: true});
    await body.fill("这段本机输入不能直接丢失");
    await nav.getByRole("button", {name: "发布记录"}).click();
    await manager.locator(".publication-list-item").first().locator(".v-btn").last().click();
    await page.getByText("编辑", {exact: true}).click();
    const confirmation = page.getByRole("dialog").filter({hasText: "切换编辑内容？"});
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", {name: "取消"}).click();
    await nav.getByRole("button", {name: "新建发布"}).click();
    await expect(body).toHaveValue("这段本机输入不能直接丢失");
    await nav.getByRole("button", {name: "发布记录"}).click();
    await manager.locator(".publication-list-item").first().locator(".v-btn").last().click();
    await page.getByText("编辑", {exact: true}).click();
    await confirmation.getByRole("button", {name: "放弃输入并编辑"}).click();
    const composer = page.locator(".publication-composer");
    await expect(composer).toBeVisible();
    await expect(nav.getByRole("button", {name: "编辑发布"}))
      .toHaveClass(/v-btn--active/);
    await expect(composer.getByRole("textbox", {name: "正文 正文", exact: true}))
      .toHaveValue("原始正文");
  } finally {
    await context.close();
  }
});

test("teacher desktop retains editor and records side by side", async ({browser}) => {
  const context = await browser.newContext({
    viewport: {width: 1440, height: 1000}, serviceWorkers: "block", storageState,
  });
  const page = await context.newPage();
  try {
    await page.goto(origin);
    await expect(page.locator(".teacher-task-nav")).toHaveCount(0);
    const composer = page.locator(".publication-composer");
    const manager = page.locator(".teacher-publication-manager");
    await expect(composer).toBeVisible();
    await expect(manager).toBeVisible();
    const position = await Promise.all([composer, manager].map(locator =>
      locator.evaluate(element => element.getBoundingClientRect().top)));
    expect(Math.abs(position[0] - position[1])).toBeLessThan(8);
  } finally {
    await context.close();
  }
});
