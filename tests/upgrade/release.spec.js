import {test, expect, enterHomework} from "../fullstack/fixture.js";
import {api, origin} from "../e2e/environment.js";
import {writeFileSync} from "node:fs";

test("released 1.0.1 storage survives actual 1.1.0 activation, offline reload and replay", async ({classroom, request}, testInfo) => {
  const previous = await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  expect(previous.ok()).toBe(true);
  const oldVersion = await previous.json();
  const screen = await classroom.open("screen");
  const {page, context} = screen;
  await expect(page.locator('meta[name="release-commit"]')).toHaveAttribute("content", oldVersion.sha);
  // Change a setting through the old UI, rather than fabricating persisted data.
  await page.goto(`${origin}/settings?section=appearance`);
  await page.getByRole("button", {name: "浅色", exact: true}).click();
  const theme = () => page.evaluate(() => JSON.parse(localStorage.getItem("Classworks_settings"))["theme.mode"]);
  await expect.poll(theme).toBe("light");
  await page.goto(origin);
  await expect(page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await enterHomework(page, "旧版待上传作业必须只保存一次");
  const queueKey = `classworks-v2-screen-publication-queue:${classroom.binding.id}`;
  const queue = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), queueKey);
  await expect.poll(async () => (await queue()).length).toBe(1);
  const [pending] = await queue();
  expect(pending.input.clientRequestId).toBeTruthy();
  await page.getByRole("button", {name: "录入作业", exact: true}).first().click();
  await page.getByRole("button", {name: "数学", exact: true}).click();
  const content = page.locator(".screen-composer").getByRole("textbox", {name: "作业内容 作业内容", exact: true});
  await content.fill("旧版尚未提交的独立草稿");
  await page.locator(".screen-composer").getByRole("button", {name: "取消", exact: true}).click();
  const draftKey = `classworks-v2-screen-homework-draft:${classroom.binding.id}:new`;
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key))?.content, draftKey))
    .toBe("旧版尚未提交的独立草稿");
  expect(await classroom.rows()).toHaveLength(0);
  // Reconnecting can auto-activate the worker before registration.update runs.
  // Capture the old controller before exposing the new release to the browser.
  await page.evaluate(() => { window.upgradePreviousWorker = navigator.serviceWorker.controller; });

  // Model separate frontend deployment while the real API is temporarily down.
  // Only induce a transport failure; successful requests still reach real HTTP/DB.
  await context.route(`${api}/**`, route => route.abort("internetdisconnected"));
  const next = await request.post(`${origin}/__test/release`, {data: {release: "next"}});
  expect(next.ok()).toBe(true);
  const newVersion = await next.json();
  await context.setOffline(false);
  const activationStarted = Date.now();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const previous = window.upgradePreviousWorker;
    await registration.update();
    if (navigator.serviceWorker.controller !== previous) return;
    await new Promise((resolve, reject) => {
      // Real Engine.IO long polling can keep an old worker's fetch event alive
      // across the default 25s heartbeat. Still require natural activation; do
      // not clear storage, unregister, or force a waiting worker through CDP.
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Worker activation timed out: ${JSON.stringify({active: registration.active?.state, waiting: registration.waiting?.state, installing: registration.installing?.state, script: registration.active?.scriptURL, controller: navigator.serviceWorker.controller?.scriptURL})}`)); }, 60000);
      const changed = () => { if (navigator.serviceWorker.controller !== previous) { cleanup(); resolve(); } };
      function cleanup() { clearTimeout(timer); navigator.serviceWorker.removeEventListener("controllerchange", changed); }
      navigator.serviceWorker.addEventListener("controllerchange", changed);
      changed();
    });
  });
  const activationMs = Date.now() - activationStarted;
  await expect(page.getByRole("button", {name: "立即刷新", exact: true})).toBeVisible();
  await context.setOffline(true);
  const [navigation] = await Promise.all([
    page.waitForNavigation({waitUntil: "domcontentloaded"}),
    page.getByRole("button", {name: "立即刷新", exact: true}).click(),
  ]);
  expect(navigation.fromServiceWorker()).toBe(true);
  await expect(page.locator('meta[name="release-commit"]')).toHaveAttribute("content", newVersion.sha);
  await expect(page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
  expect((await queue())[0].input).toEqual(pending.input);
  expect(await theme()).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("classworks-v2-screen-token"))).toBe(classroom.screenToken);
  await page.getByRole("button", {name: "录入作业", exact: true}).first().click();
  await expect(content).toHaveValue("旧版尚未提交的独立草稿");
  await page.locator(".screen-composer").getByRole("button", {name: "取消", exact: true}).click();
  await context.unroute(`${api}/**`);
  await context.setOffline(false);
  await expect.poll(async () => (await queue()).length).toBe(0);
  await expect(page.getByText("旧版待上传作业必须只保存一次", {exact: true})).toBeVisible();
  const replay = await request.post(`${api}/api/v2/classroom-screens/publications`, {
    headers: {"X-Classworks-Screen-Token": classroom.screenToken}, data: pending.input,
  });
  expect(replay.ok()).toBe(true);
  const rows = await classroom.rows();
  expect(rows).toHaveLength(1);
  expect(rows[0].revisions).toHaveLength(1);
  expect(rows[0].creationRequestId).toBe(pending.input.clientRequestId);

  const noticeResponse = await request.post(`${api}/api/v2/publications`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`},
    data: {type: "NOTICE", status: "PUBLISHED", priority: "MINOR", content: "升级后的次要通知", contentJson: {popupEnabled: false}, targetWorkspaceIds: [classroom.workspace.id]},
  });
  expect(noticeResponse.status()).toBe(201);
  await expect(page.locator(".feed-notices")).toContainText("升级后的次要通知");
  await expect(page.locator(".feed-notices")).toContainText("次要");
  await expect(page.locator(".screen-notice-popup")).not.toBeVisible();
  expect(screen.errors).toEqual([]);
  const proof = testInfo.outputPath("release-pair.json");
  writeFileSync(proof, JSON.stringify({previous: oldVersion, next: newVersion, activationMs, publicationId: rows[0].id}, null, 2));
  await testInfo.attach("release-pair", {path: proof, contentType: "application/json"});
});
