import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

async function openRole(browser, role) {
  const values = {
    "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
    "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true}),
    ...(role === "teacher" ? {"classworks-v2-access-token": "teacher-token", "classworks-v2-refresh-token": "teacher-refresh"}
      : {"classworks-v2-screen-token": "screen-token"}),
  };
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, serviceWorkers: "allow",
    storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}});
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await expect(page.getByRole("button", {name: role === "screen" ? "录入作业" : "退出", exact: true}).first()).toBeVisible();
  return {page, context, errors};
}

async function enterScreenHomework(page, content) {
  await page.getByRole("button", {name: "录入作业", exact: true}).first().click();
  await page.getByRole("button", {name: "数学", exact: true}).click();
  await page.getByRole("textbox", {name: "作业内容 作业内容", exact: true}).fill(content);
  await page.getByRole("button", {name: "保存作业", exact: true}).click();
  await expect(page.locator(".screen-composer")).not.toBeVisible();
}

test.beforeEach(async ({request}) => {
  expect((await request.post(`${origin}/__test/release`, {data: {release: "previous"}})).ok()).toBe(true);
  expect((await request.post(`${api}/__test/reset`)).ok()).toBe(true);
});

test("teacher publishes using the UI and a separate screen receives a real Socket.IO invalidation", async ({browser, request}) => {
  const teacher = await openRole(browser, "teacher");
  const screen = await openRole(browser, "screen");
  try {
    await expect.poll(async () => (await (await request.get(`${api}/__test/state`)).json()).data.roomJoins).toBeGreaterThanOrEqual(2);
    await teacher.page.locator(".v-select").filter({hasText: "科目"}).first().click();
    await teacher.page.getByRole("option", {name: "数学", exact: true}).click();
    await teacher.page.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
    await teacher.page.getByRole("option", {name: /高一一班/}).click();
    await teacher.page.keyboard.press("Escape");
    await teacher.page.getByRole("textbox", {name: "正文 正文", exact: true}).fill("浏览器测试：完成数学第十页");
    await teacher.page.getByRole("button", {name: "正式发布", exact: true}).click();
    await expect(screen.page.getByText("浏览器测试：完成数学第十页", {exact: true})).toBeVisible();
    const state = (await (await request.get(`${api}/__test/state`)).json()).data;
    expect(state.items).toHaveLength(1);
    expect(state.socketEvents).toBe(1);
    expect(teacher.errors).toEqual([]); expect(screen.errors).toEqual([]);
  } finally { await teacher.context.close(); await screen.context.close(); }
});

test("installed PWA reloads offline and uploads queued homework once after reconnect", async ({browser, request}) => {
  const screen = await openRole(browser, "screen");
  try {
    await enterScreenHomework(screen.page, "联网时缓存的作业");
    await expect(screen.page.getByText("联网时缓存的作业", {exact: true})).toBeVisible();
    await screen.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => screen.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await screen.context.setOffline(true);
    await enterScreenHomework(screen.page, "断网后录入的作业");
    const response = await screen.page.reload({waitUntil: "domcontentloaded"});
    expect(response.fromServiceWorker()).toBe(true);
    await expect(screen.page.getByText("联网时缓存的作业", {exact: true})).toBeVisible();
    await expect(screen.page.getByText(/离线 · 1 项待提交/)).toBeVisible();
    await screen.context.setOffline(false);
    await expect(screen.page.getByText("断网后录入的作业", {exact: true})).toBeVisible();
    await expect.poll(() => screen.page.evaluate(() => JSON.parse(localStorage.getItem("classworks-v2-screen-publication-queue:screen-a"))?.length)).toBe(0);
    expect((await (await request.get(`${api}/__test/state`)).json()).data.items).toHaveLength(2);
    expect(screen.errors).toEqual([]);
  } finally { await screen.context.close(); }
});

test("PWA upgrade preserves pending homework through worker activation and offline reload before uploading once", async ({browser, request}) => {
  test.setTimeout(90000);
  const screen = await openRole(browser, "screen");
  const queueKey = "classworks-v2-screen-publication-queue:screen-a";
  const readQueue = () => screen.page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), queueKey);
  const backendState = async () => (await (await request.get(`${api}/__test/state`)).json()).data;
  try {
    await expect(screen.page.locator("html")).toHaveAttribute("data-e2e-release", "previous");
    await screen.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => screen.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await screen.context.setOffline(true);
    await enterScreenHomework(screen.page, "跨版本升级仍需保留的数学作业");
    const pending = await readQueue();
    expect(pending).toHaveLength(1);
    expect(pending[0].input.clientRequestId).toBeTruthy();
    expect((await backendState()).items).toHaveLength(0);

    // The static site can update while the separately hosted upload API is down.
    expect((await request.post(`${api}/__test/upload-availability`, {data: {available: false}})).ok()).toBe(true);
    expect((await request.post(`${origin}/__test/release`, {data: {release: "next"}})).ok()).toBe(true);
    await screen.context.setOffline(false);
    await expect.poll(async () => (await backendState()).uploadRequests.length).toBeGreaterThan(0);
    // Exercise the browser's real install/activate/clientsClaim sequence. Do not
    // unregister the worker, clear caches/storage, or inject a replacement queue.
    await screen.page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const previous = navigator.serviceWorker.controller;
      await registration.update();
      if (navigator.serviceWorker.controller !== previous) return;
      await new Promise((resolve, reject) => {
        const changed = () => {
          if (navigator.serviceWorker.controller === previous) return;
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener("controllerchange", changed);
          resolve();
        };
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener("controllerchange", changed);
          reject(new Error("New service worker did not take control"));
        }, 20000);
        navigator.serviceWorker.addEventListener("controllerchange", changed);
        changed();
      });
    });
    await expect(screen.page.getByText("新版本已经准备好，刷新后立即使用。", {exact: true})).toBeVisible();
    expect(await readQueue()).toEqual(pending);
    expect((await backendState()).items).toHaveLength(0);

    // Use the actual update prompt, with networking disabled: both new HTML and
    // the changed entry chunk must come from the newly activated precache.
    await screen.context.setOffline(true);
    const [response] = await Promise.all([
      screen.page.waitForNavigation({waitUntil: "domcontentloaded"}),
      screen.page.getByRole("button", {name: "立即刷新", exact: true}).click(),
    ]);
    expect(response.fromServiceWorker()).toBe(true);
    await expect(screen.page.locator('meta[name="e2e-release"]')).toHaveAttribute("content", "next");
    await expect(screen.page.locator("html")).toHaveAttribute("data-e2e-release", "next");
    await expect(screen.page.getByText(/离线 · 1 项待提交/)).toBeVisible();
    expect(await readQueue()).toEqual(pending);
    expect(await screen.page.evaluate(() => localStorage.getItem("classworks-v2-screen-token"))).toBe("screen-token");

    expect((await request.post(`${api}/__test/upload-availability`, {data: {available: true}})).ok()).toBe(true);
    await screen.context.setOffline(false);
    await expect(screen.page.getByText("跨版本升级仍需保留的数学作业", {exact: true})).toBeVisible();
    await expect.poll(readQueue).toEqual([]);
    await screen.page.reload();
    await expect(screen.page.getByText("跨版本升级仍需保留的数学作业", {exact: true})).toBeVisible();
    const state = await backendState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].clientRequestId).toBe(pending[0].input.clientRequestId);
    expect(state.uploadRequests.every(item => item.clientRequestId === pending[0].input.clientRequestId)).toBe(true);
    expect(state.uploadRequests.filter(item => item.available)).toHaveLength(1);
    expect(state.socketEvents).toBe(1);
    expect(await readQueue()).toEqual([]);
    expect(screen.errors).toEqual([]);
  } finally { await screen.context.close(); }
});

test("revision conflict preserves typed content until explicit confirmation saves the latest revision", async ({browser, request}) => {
  const screen = await openRole(browser, "screen");
  try {
    await enterScreenHomework(screen.page, "原始作业");
    await screen.page.getByRole("button", {name: "修改", exact: true}).click();
    await screen.page.getByRole("textbox", {name: "作业内容 作业内容", exact: true}).fill("本机保留的输入");
    await request.post(`${api}/__test/concurrent-edit`, {data: {id: "pub-1", content: "另一位教师的新内容"}});
    await screen.page.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(screen.page.getByRole("textbox", {name: "作业内容 作业内容", exact: true})).toHaveValue("本机保留的输入");
    await expect(screen.page.getByText("服务器：另一位教师的新内容", {exact: true})).toBeVisible();
    await screen.page.getByRole("button", {name: "以本机输入生成新版本", exact: true}).click();
    await screen.page.getByRole("button", {name: "保存新版本", exact: true}).click();
    await expect(screen.page.locator(".screen-composer")).not.toBeVisible();
    await expect(screen.page.getByText("本机保留的输入", {exact: true})).toBeVisible();
    const state = (await (await request.get(`${api}/__test/state`)).json()).data;
    expect(state.versionChecks).toEqual(['"1"', '"2"']);
    expect(state.items[0].revision).toBe(3);
    expect(screen.errors).toEqual([]);
  } finally { await screen.context.close(); }
});
