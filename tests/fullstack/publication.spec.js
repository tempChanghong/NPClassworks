import {test, expect, enterHomework} from "./fixture.js";
import {api} from "../e2e/environment.js";

test("teacher notice priorities and popup choices reach the screen and acknowledgement database", async ({classroom}) => {
  test.setTimeout(90000);
  const teacher = await classroom.open("teacher");
  const screen = await classroom.open("screen");
  const composer = teacher.page.locator(".publication-composer");
  for (const [label, priority, popup] of [["次要", "MINOR", false], ["次要", "MINOR", true], ["普通", "NORMAL", true], ["重要", "IMPORTANT", true], ["紧急", "URGENT", true]]) {
    await composer.getByRole("button", {name: "通知", exact: true}).click();
    await composer.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
    await teacher.page.getByRole("option", {name: /高一一班/}).click();
    await teacher.page.keyboard.press("Escape");
    await composer.locator(".v-select").filter({hasText: "优先级"}).click();
    await teacher.page.getByRole("option", {name: label, exact: true}).click();
    const toggle = composer.getByRole("checkbox", {name: "大屏弹窗提示", exact: true});
    if (priority === "MINOR") {
      await expect(toggle).toBeEnabled();
      await toggle.setChecked(popup);
    } else {
      await expect(toggle).toBeDisabled();
      await expect(toggle).toBeChecked();
    }
    const content = `${label}通知弹窗=${popup}`;
    await composer.getByRole("textbox", {name: "正文 正文", exact: true}).fill(content);
    const created = teacher.page.waitForResponse(response => response.url() === `${api}/api/v2/publications` && response.request().method() === "POST");
    await composer.getByRole("button", {name: "正式发布", exact: true}).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const row = (await response.json()).data;
    expect(row.priority).toBe(priority);
    expect(row.contentJson.popupEnabled).toBe(popup);
    await teacher.page.getByRole("button", {name: "完成", exact: true}).click();
    await expect.poll(() => screen.frames.some(frame => frame.includes(row.id))).toBe(true);
    const dialog = screen.page.locator(".screen-notice-popup");
    if (popup) {
      await expect(dialog.locator(".notice-popup-content")).toHaveText(content);
      await screen.page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", {name: "知道了", exact: true}).click();
      await expect(dialog).not.toBeVisible();
      await expect.poll(async () => Boolean((await classroom.prisma.notificationScreenDelivery.findUnique({where: {
        publicationId_screenBindingId: {publicationId: row.id, screenBindingId: classroom.binding.id},
      }}))?.acknowledgedAt)).toBe(true);
    } else {
      await expect(screen.page.getByText(content, {exact: true})).toBeVisible();
      await expect(dialog).not.toBeVisible();
    }
  }
  await screen.page.reload();
  await expect(screen.page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
  await expect(screen.page.locator(".screen-notice-popup")).not.toBeVisible();
  expect(teacher.errors).toEqual([]);
  expect(screen.errors).toEqual([]);
});

test("teacher publish commits a revision and reaches the screen through real Socket.IO", async ({classroom}) => {
  const teacher = await classroom.open("teacher");
  const screen = await classroom.open("screen");
  await expect.poll(() => screen.frames.some(frame => frame.includes('"workspaces-joined"'))).toBe(true);
  await teacher.page.locator(".v-select").filter({hasText: "科目"}).first().click();
  await teacher.page.getByRole("option", {name: "数学", exact: true}).click();
  await teacher.page.getByRole("combobox", {name: "发布到 发布到", exact: true}).click();
  await teacher.page.getByRole("option", {name: /高一一班/}).click();
  await teacher.page.keyboard.press("Escape");
  const content = "真实数据库：完成数学第十页";
  await teacher.page.getByRole("textbox", {name: "正文 正文", exact: true}).fill(content);
  const created = teacher.page.waitForResponse(response => response.url() === `${api}/api/v2/publications` && response.request().method() === "POST");
  await teacher.page.getByRole("button", {name: "正式发布", exact: true}).click();
  expect((await created).status()).toBe(201);
  const rows = await classroom.rows();
  expect(rows).toHaveLength(1);
  expect(rows[0].content).toBe(content);
  expect(rows[0].revisions).toHaveLength(1);
  await expect.poll(() => screen.frames.some(frame => frame.includes('"publication.created"') && frame.includes(rows[0].id))).toBe(true);
  await expect(screen.page.getByText(content, {exact: true})).toBeVisible();
  expect(teacher.errors).toEqual([]);
  expect(screen.errors).toEqual([]);
});

test("offline PWA reload preserves queued input and reconnect/replay creates only one database row", async ({classroom, request}) => {
  const screen = await classroom.open("screen");
  await screen.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => screen.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await screen.context.setOffline(true);
  const content = "断网重载后只提交一次的作业";
  await enterHomework(screen.page, content);
  const key = `classworks-v2-screen-publication-queue:${classroom.binding.id}`;
  const readQueue = () => screen.page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), key);
  const queued = await readQueue();
  expect(queued).toHaveLength(1);
  expect(queued[0].input.clientRequestId).toBeTruthy();
  expect(await classroom.rows()).toHaveLength(0);
  const reload = await screen.page.reload({waitUntil: "domcontentloaded"});
  expect(reload.fromServiceWorker()).toBe(true);
  await expect(screen.page.getByText(/离线 · 1 项待提交/)).toBeVisible();
  expect(await readQueue()).toEqual(queued);
  await screen.context.setOffline(false);
  await expect(screen.page.getByText(content, {exact: true})).toBeVisible();
  await expect.poll(async () => (await readQueue()).length).toBe(0);
  const [saved] = await classroom.rows();
  expect(saved.creationRequestId).toBe(queued[0].input.clientRequestId);
  // Real authenticated HTTP replay models a lost success response, beyond merely counting UI submissions.
  const replay = await request.post(`${api}/api/v2/classroom-screens/publications`, {
    headers: {"X-Classworks-Screen-Token": classroom.screenToken}, data: queued[0].input,
  });
  expect(replay.ok()).toBe(true);
  expect((await replay.json()).data.id).toBe(saved.id);
  await screen.page.reload();
  await expect(screen.page.getByText(content, {exact: true})).toBeVisible();
  const rows = await classroom.rows();
  expect(rows).toHaveLength(1);
  expect(rows[0].revisions).toHaveLength(1);
  expect(screen.errors).toEqual([]);
});

test("two browser editors preserve stale input until explicit conflict confirmation creates revision three", async ({classroom}) => {
  const first = await classroom.open("screen");
  await enterHomework(first.page, "原始作业");
  const second = await classroom.open("screen");
  const editor = page => page.getByRole("textbox", {name: "作业内容 作业内容", exact: true});
  await first.page.getByRole("button", {name: "修改", exact: true}).click();
  await editor(first.page).fill("本机保留的输入");
  await second.page.getByRole("button", {name: "修改", exact: true}).click();
  await editor(second.page).fill("另一端已保存的内容");
  await second.page.getByRole("button", {name: "保存作业", exact: true}).click();
  await expect(second.page.locator(".screen-composer")).not.toBeVisible();
  const [before] = await classroom.rows();
  expect(before.revision).toBe(2);
  const conflict = first.page.waitForResponse(response => response.request().method() === "PATCH" && response.url().endsWith(`/publications/${before.id}`));
  await first.page.getByRole("button", {name: "保存作业", exact: true}).click();
  const rejected = await conflict;
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).code).toBe("PUBLICATION_REVISION_CONFLICT");
  expect(rejected.request().headers()["if-match"]).toBe('"1"');
  await expect(editor(first.page)).toHaveValue("本机保留的输入");
  await expect(first.page.getByText("服务器：另一端已保存的内容", {exact: true})).toBeVisible();
  expect(await classroom.rows()).toEqual([before]);
  await first.page.getByRole("button", {name: "以本机输入生成新版本", exact: true}).click();
  const confirmed = first.page.waitForResponse(response => response.request().method() === "PATCH" && response.url().endsWith(`/publications/${before.id}`));
  await first.page.getByRole("button", {name: "保存新版本", exact: true}).click();
  expect((await confirmed).status()).toBe(200);
  expect((await confirmed).request().headers()["if-match"]).toBe('"2"');
  await expect(first.page.locator(".screen-composer")).not.toBeVisible();
  const rows = await classroom.rows();
  expect(rows).toHaveLength(1);
  expect(rows[0].revision).toBe(3);
  expect(rows[0].content).toBe("本机保留的输入");
  expect(rows[0].revisions.map(row => row.snapshot.content)).toEqual(["原始作业", "另一端已保存的内容", "本机保留的输入"]);
  expect(first.errors).toEqual([]);
  expect(second.errors).toEqual([]);
});
