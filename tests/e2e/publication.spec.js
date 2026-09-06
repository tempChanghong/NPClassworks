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

test("screen highlights real corrections, coalesces consecutive edits and resets on date switch", async ({browser, request}, testInfo) => {
  const response = await request.post(`${api}/api/v2/publications`, {data: {type: "ASSIGNMENT", subjectId: "math", boardDate: "2026-09-07",
    content: "练习册第10页", title: "数学练习", targetWorkspaceIds: ["class-a"]}});
  const item = (await response.json()).data;
  const screen = await openRole(browser, "screen");
  try {
    await screen.page.getByLabel("选择日期").fill("2026-09-07");
    await expect(screen.page.getByText("练习册第10页", {exact: true})).toBeVisible();
    const banner = screen.page.locator(".screen-homework-changes");
    await expect(banner).toHaveCount(0);
    const update = async (revision, data) => {
      const result = await request.patch(`${api}/api/v2/publications/${item.id}`, {headers: {"If-Match": `"${revision}"`}, data});
      expect(result.ok()).toBe(true);
    };
    await update(1, {content: "练习册第12页"});
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("正文：练习册第10页 → 练习册第12页");
    await update(2, {content: "练习册第14页", dueAt: "2026-09-08T10:00:00Z"});
    await expect(banner).toContainText("正文：练习册第10页 → 练习册第14页");
    await banner.locator("summary").click();
    await expect(banner.getByText("原来：练习册第10页", {exact: true})).toBeVisible();
    await expect(banner.getByText("现在：练习册第14页", {exact: true})).toBeVisible();
    await screen.page.screenshot({path: testInfo.outputPath("homework-correction.png")});
    await banner.getByRole("button", {name: "收起提示"}).click();
    await screen.page.getByRole("button", {name: "刷新", exact: true}).first().click();
    await expect(banner).toHaveCount(0);
    await screen.page.getByLabel("选择日期").fill("2026-09-08");
    await screen.page.getByLabel("选择日期").fill("2026-09-07");
    await expect(screen.page.getByText("练习册第14页", {exact: true})).toBeVisible();
    await expect(banner).toHaveCount(0);
    await update(3, {isCertified: false});
    await expect.poll(async () => (await (await request.get(`${api}/__test/state`)).json()).data.items[0].revision).toBe(4);
    await expect(banner).toHaveCount(0);
    expect(screen.errors).toEqual([]);
  } finally { await screen.context.close(); }
});

test("draft read failure preserves original text until explicit retry restores the editor", async ({browser}) => {
  const screen = await openRole(browser, "screen");
  const key = "classworks-v2-screen-homework-draft:screen-a:new";
  try {
    const original = await screen.page.evaluate(key => {
      const raw = JSON.stringify({subjectId: "math", targetWorkspaceId: "class-a", content: "读取失败也不能丢掉的草稿", updatedAt: Date.now()});
      localStorage.setItem(key, raw);
      window.originalDraftRead = Storage.prototype.getItem;
      window.draftReadBlocked = true;
      Storage.prototype.getItem = function (name) {
        if (window.draftReadBlocked && name === key) throw new window.DOMException("Read blocked", "SecurityError");
        return window.originalDraftRead.call(this, name);
      };
      return raw;
    }, key);
    await screen.page.getByRole("button", {name: "录入作业", exact: true}).first().click();
    const composer = screen.page.locator(".screen-composer");
    await expect(composer.getByText(/无法读取本机草稿/)).toBeVisible();
    await expect(composer.getByRole("button", {name: "保存作业", exact: true})).toBeDisabled();
    await expect(composer.getByRole("textbox")).toHaveCount(0);
    await composer.getByRole("button", {name: "重新读取草稿"}).click();
    expect(await screen.page.evaluate(key => window.originalDraftRead.call(localStorage, key), key)).toBe(original);
    await composer.getByRole("button", {name: "取消", exact: true}).click();
    await expect(composer).not.toBeVisible();
    await screen.page.getByRole("button", {name: "录入作业", exact: true}).first().click();
    await expect(composer.getByText(/无法读取本机草稿/)).toBeVisible();
    await screen.page.evaluate(() => { window.draftReadBlocked = false; });
    await composer.getByRole("button", {name: "重新读取草稿"}).click();
    const content = composer.getByRole("textbox", {name: "作业内容 作业内容", exact: true});
    await expect(content).toHaveValue("读取失败也不能丢掉的草稿");
    await expect(composer.getByText(/已自动恢复这台大屏/)).toBeVisible();
    await content.fill("恢复后提交的作业");
    await composer.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(composer).not.toBeVisible();
    await expect(screen.page.getByText("恢复后提交的作业", {exact: true})).toBeVisible();
    expect(await screen.page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
    expect(screen.errors).toEqual([]);
  } finally { await screen.context.close(); }
});

test("unreadable local queue shows an error instead of synced and recovers through the UI", async ({browser}) => {
  const screen = await openRole(browser, "screen");
  try {
    await screen.page.addInitScript(() => {
      const read = Storage.prototype.getItem;
      window.queueReadsBlocked = true;
      Storage.prototype.getItem = function (key) {
        if (window.queueReadsBlocked && key.startsWith("classworks-v2-screen-publication-queue:")) {
          throw new window.DOMException("Storage unavailable", "SecurityError");
        }
        return read.call(this, key);
      };
    });
    await screen.page.reload();
    await expect(screen.page.locator(".screen-sync-chip")).toHaveText("本机队列读取异常");
    await screen.page.locator(".screen-sync-chip").click();
    const dialog = screen.page.getByRole("dialog");
    await expect(dialog.getByText(/无法读取本机待提交作业/)).toBeVisible();
    await expect(dialog.getByText("没有待提交作业", {exact: true})).toHaveCount(0);
    await expect(dialog.getByText("当前大屏上的作业已经与服务器同步")).toHaveCount(0);
    await dialog.getByRole("button", {name: "重新读取本机队列"}).click();
    await expect(screen.page.locator(".screen-sync-chip")).toHaveText("本机队列读取异常");
    await screen.page.evaluate(() => { window.queueReadsBlocked = false; });
    await dialog.getByRole("button", {name: "重新读取本机队列"}).click();
    await expect(dialog.getByText("没有待提交作业", {exact: true})).toBeVisible();
    await expect(dialog.getByRole("button", {name: "重新读取本机队列"})).toHaveCount(0);
    await expect(screen.page.locator(".screen-sync-chip")).toHaveText("实时同步");
    expect(screen.errors).toEqual([]);
  } finally { await screen.context.close(); }
});

test("remote reload preserves editing during a storage failure and runs after successful submission", async ({browser, request}) => {
  const screen = await openRole(browser, "screen");
  const {page} = screen;
  try {
    await page.getByRole("button", {name: "录入作业", exact: true}).first().click();
    await page.getByRole("button", {name: "数学", exact: true}).click();
    await page.evaluate(() => {
      window.originalStorageWrite = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("classworks-v2-screen-homework-draft:")) throw new window.DOMException("Quota full", "QuotaExceededError");
        return window.originalStorageWrite.call(this, key, value);
      };
      window.reloadTestMarker = "still editing";
    });
    const input = page.getByRole("textbox", {name: "作业内容 作业内容", exact: true});
    await input.fill("远程重载时必须保留的作业");
    await expect(page.getByText(/本机草稿未能保存/)).toBeVisible();
    await request.post(`${api}/__test/reload-command`);
    const heartbeat = page.waitForResponse(response => response.url().endsWith("/classroom-screens/heartbeat"));
    await page.evaluate(() => window.dispatchEvent(new window.Event("visibilitychange")));
    await heartbeat;
    await expect(input).toHaveValue("远程重载时必须保留的作业");
    expect((await (await request.get(`${api}/__test/state`)).json()).data.commandAcknowledgements).toEqual([]);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.reloadTestMarker)).toBe("still editing");
    await page.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(page.locator(".screen-composer")).not.toBeVisible();
    const reloaded = page.waitForEvent("domcontentloaded");
    await page.evaluate(() => window.dispatchEvent(new window.Event("visibilitychange")));
    await reloaded;
    await expect(page.getByText("远程重载时必须保留的作业", {exact: true})).toBeVisible();
    expect((await (await request.get(`${api}/__test/state`)).json()).data.commandAcknowledgements).toHaveLength(1);
    expect(screen.errors).toEqual([]);
  } finally { await screen.context.close(); }
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

test("screen first opens its lazy composer offline and restores a draft after closing and reopening", async ({browser, request}) => {
  const screen = await openRole(browser, "screen");
  try {
    await screen.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => screen.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    expect(await screen.page.evaluate(() => globalThis.performance.getEntriesByType("resource")
      .some(entry => /ScreenHomeworkDialog-.*\.js/.test(entry.name)))).toBe(false);
    await screen.context.setOffline(true);
    const chunk = screen.page.waitForResponse(response => /ScreenHomeworkDialog-.*\.js/.test(response.url()));
    await screen.page.getByRole("button", {name: "录入作业", exact: true}).first().click();
    expect((await chunk).fromServiceWorker()).toBe(true);
    await screen.page.getByRole("button", {name: "数学", exact: true}).click();
    const content = screen.page.getByRole("textbox", {name: "作业内容 作业内容", exact: true});
    await content.fill("首次断网打开仍保留的草稿");
    await screen.page.getByRole("button", {name: "取消", exact: true}).click();
    await expect(screen.page.locator(".screen-composer")).not.toBeVisible();
    await screen.page.getByRole("button", {name: "录入作业", exact: true}).first().click();
    await expect(content).toHaveValue("首次断网打开仍保留的草稿");
    await screen.page.getByRole("button", {name: "保存作业", exact: true}).click();
    await expect(screen.page.locator(".screen-composer")).not.toBeVisible();
    const queued = await screen.page.evaluate(() => JSON.parse(localStorage.getItem("classworks-v2-screen-publication-queue:screen-a")));
    expect(queued).toHaveLength(1);
    expect(queued[0].input.content).toBe("首次断网打开仍保留的草稿");
    expect((await (await request.get(`${api}/__test/state`)).json()).data.items).toHaveLength(0);
    expect(screen.errors).toEqual([]);
  } finally { await screen.context.close(); }
});

test("lazy history and delivery dialogs fetch their data on the first opening", async ({browser, request}) => {
  expect((await request.post(`${api}/api/v2/publications`, {data: {type: "NOTICE", content: "异步弹窗验证通知"}})).ok()).toBe(true);
  const teacher = await openRole(browser, "teacher");
  try {
    const menu = teacher.page.getByRole("button").filter({has: teacher.page.locator(".mdi-dots-vertical")});
    await menu.click();
    const history = teacher.page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/publications/pub-1/revisions"));
    await teacher.page.getByText("版本历史与恢复", {exact: true}).click();
    expect((await history).ok()).toBe(true);
    await expect(teacher.page.getByText("不可删除的版本历史", {exact: true})).toBeVisible();
    await teacher.page.getByRole("button", {name: "关闭", exact: true}).click();
    await menu.click();
    const delivery = teacher.page.waitForResponse(response => response.url().endsWith("/publications/pub-1/screen-deliveries"));
    await teacher.page.getByText("查看大屏送达状态", {exact: true}).click();
    expect((await delivery).ok()).toBe(true);
    await expect(teacher.page.getByText("没有目标班级大屏", {exact: true})).toBeVisible();
    expect(teacher.errors).toEqual([]);
  } finally { await teacher.context.close(); }
});

test("history opens one page, loads older versions and restores one from the last page", async ({browser, request}) => {
  await request.post(`${api}/api/v2/publications`, {data: {content: "历史分页测试"}});
  await request.post(`${api}/__test/history`);
  const teacher = await openRole(browser, "teacher");
  try {
    await teacher.page.getByRole("button").filter({has: teacher.page.locator(".mdi-dots-vertical")}).click();
    await teacher.page.getByText("版本历史与恢复", {exact: true}).click();
    const dialog = teacher.page.getByRole("dialog").filter({hasText: "不可删除的版本历史"});
    await expect(dialog.locator(".v-timeline-item")).toHaveCount(20);
    await dialog.getByRole("button", {name: "加载更早版本"}).click();
    await expect(dialog.locator(".v-timeline-item")).toHaveCount(40);
    await dialog.getByRole("button", {name: "加载更早版本"}).click();
    await expect(dialog.locator(".v-timeline-item")).toHaveCount(45);
    await expect(dialog.getByRole("button", {name: "加载更早版本"})).toHaveCount(0);
    await dialog.locator(".v-timeline-item").last().getByRole("button", {name: "恢复此版本"}).click();
    await expect(dialog.locator(".v-timeline-item")).toHaveCount(20);
    await expect(dialog.getByText("版本 46", {exact: true})).toBeVisible();
    const state = (await (await request.get(`${api}/__test/state`)).json()).data;
    expect(state.historyRequests).toEqual([{limit:20,before:null},{limit:20,before:26},{limit:20,before:6},{limit:20,before:null}]);
    expect(state.items[0].content).toBe("历史正文1");
    expect(teacher.errors).toEqual([]);
  } finally { await teacher.context.close(); }
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

test("screen survives repeated transport loss and browser freezing without accumulating subscriptions or missing updates", async ({browser, request}) => {
  test.setTimeout(120000);
  const screen = await openRole(browser, "screen");
  const cdp = await screen.context.newCDPSession(screen.page);
  const state = async () => (await (await request.get(`${api}/__test/state`)).json()).data;
  try {
    await expect.poll(async () => (await state()).classroomSubscribers).toBe(1);
    // Let initial bootstrap/connect refreshes finish before measuring steady state.
    await screen.page.waitForTimeout(600);
    for (let cycle = 1; cycle <= 8; cycle++) {
      const freeze = cycle % 2 === 0;
      await screen.context.setOffline(true);
      if (freeze) await cdp.send("Page.setWebLifecycleState", {state: "frozen"});
      expect((await request.post(`${api}/__test/drop-connections`)).ok()).toBe(true);
      await expect.poll(async () => (await state()).connections).toBe(0);
      const disconnected = await state();
      expect(disconnected.classroomSubscribers).toBe(0);
      const content = `第 ${cycle} 次断线期间的新作业`;
      const published = await request.post(`${api}/api/v2/publications`, {data: {content}});
      expect(published.ok()).toBe(true);
      const item = (await published.json()).data;
      if (freeze) await cdp.send("Page.setWebLifecycleState", {state: "active"});
      await screen.context.setOffline(false);
      await expect.poll(async () => (await state()).classroomSubscribers).toBe(1);
      await expect(screen.page.getByText(content, {exact: true})).toBeVisible();
      await screen.page.waitForTimeout(600);
      const recovered = await state();
      expect(recovered.connections).toBe(1);
      expect(recovered.roomJoins - disconnected.roomJoins).toBe(1);
      // Online recovery and a later Socket.IO connect may each request a fresh
      // snapshot. Neither count should grow with successive reconnect cycles.
      expect(recovered.screenFeedRequests - disconnected.screenFeedRequests).toBeGreaterThanOrEqual(1);
      expect(recovered.screenFeedRequests - disconnected.screenFeedRequests).toBeLessThanOrEqual(2);
      const edited = `第 ${cycle} 次恢复后的最新版`;
      expect((await request.post(`${api}/__test/concurrent-edit`, {data: {id: item.id, content: edited}})).ok()).toBe(true);
      expect((await request.post(`${api}/__test/invalidation-burst`)).ok()).toBe(true);
      await expect(screen.page.getByText(edited, {exact: true})).toBeVisible();
      await screen.page.waitForTimeout(350);
      expect((await state()).screenFeedRequests - recovered.screenFeedRequests).toBe(1);
    }
    expect(screen.errors).toEqual([]);
  } finally {
    await cdp.send("Page.setWebLifecycleState", {state: "active"}).catch(() => {});
    await screen.context.close();
  }
  // Polling transports may require the normal Socket.IO heartbeat timeout after
  // their browser disappears; do not forcibly clear the server for this assertion.
  await expect.poll(async () => (await state()).connections, {timeout: 50000}).toBe(0);
  expect((await state()).classroomSubscribers).toBe(0);
});
