import {test, expect, enterHomework} from "./fixture.js";
import {api} from "../e2e/environment.js";
import {io} from "socket.io-client";
import {notificationDeliveryStorageKey} from "../../src/utils/notificationDeliveryQueue.js";

test("offline multi-tab notice confirmations survive PWA reload and respect withdrawn and revised database rows", async ({classroom, request}) => {
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const notices = [];
  for (const content of ["离线确认后仍有效", "离线确认后被撤回", "离线确认后被更正"]) {
    const response = await request.post(`${api}/api/v2/publications`, {headers, data: {
      type: "NOTICE", status: "PUBLISHED", priority: "MINOR", content, contentJson: {popupEnabled: false},
      targetWorkspaceIds: [classroom.workspace.id],
    }});
    expect(response.status()).toBe(201);
    notices.push((await response.json()).data);
  }
  const screen = await classroom.open("screen");
  const other = await screen.context.newPage();
  await other.goto(screen.page.url());
  const key = notificationDeliveryStorageKey(api, classroom.binding);
  const durable = page => page.evaluate(key => Object.keys(localStorage)
    .filter(candidate => candidate === key || candidate.startsWith(`${key}:staged:`))
    .flatMap(candidate => JSON.parse(localStorage.getItem(candidate)).items), key);
  const delivery = notice => classroom.prisma.notificationScreenDelivery.findUnique({where: {
    publicationId_screenBindingId: {publicationId: notice.id, screenBindingId: classroom.binding.id},
  }, select: {publicationId: true, screenBindingId: true, revision: true, receivedAt: true, displayedAt: true, acknowledgedAt: true}});
  for (const page of [screen.page, other]) {
    await page.getByRole("button", {name: "通知", exact: true}).first().click();
    await expect(page.locator(".notification-center__item")).toHaveCount(3);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  }
  await expect.poll(async () => (await durable(other)).length).toBe(0);
  for (const notice of notices) expect((await delivery(notice)).acknowledgedAt).toBeNull();
  await screen.context.setOffline(true);
  await screen.page.evaluate(async key => {
    await new Promise(resolve => {
      void navigator.locks.request(key, () => { resolve(); return new Promise(() => {}); });
    });
  }, key);
  for (const [index, page] of [[0, screen.page], [1, other], [2, screen.page]]) {
    await page.locator(".notification-center__item").filter({hasText: notices[index].content})
      .getByRole("button", {name: "知道了", exact: true}).click();
  }
  const replay = (await durable(other)).filter(item => item.acknowledged);
  expect(replay.map(item => item.publicationId).sort()).toEqual(notices.map(item => item.id).sort());
  const reload = await other.reload({waitUntil: "domcontentloaded"});
  expect(reload.fromServiceWorker()).toBe(true);
  await expect(other.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
  // Reload may stage the displayed/confirmed snapshot again before consolidation.
  // Require each original revision, without assuming one physical record per item.
  expect([...new Set((await durable(other)).filter(item => item.acknowledged)
    .map(item => `${item.publicationId}:${item.revision}`))].sort()).toEqual(notices.map(item => `${item.id}:1`).sort());
  await screen.page.close(); // Releases the lock; only durable records can recover.
  const withdrawn = await request.post(`${api}/api/v2/publications/${notices[1].id}/withdraw`, {
    headers: {...headers, "If-Match": '"1"'}, data: {},
  });
  expect(withdrawn.ok()).toBe(true);
  const updated = await request.patch(`${api}/api/v2/publications/${notices[2].id}`, {
    headers: {...headers, "If-Match": '"1"'}, data: {content: "更正后的第二版通知"},
  });
  expect(updated.ok()).toBe(true);
  const revised = (await updated.json()).data;
  expect(revised.revision).toBe(2);
  await screen.context.setOffline(false);
  await expect.poll(async () => Boolean((await delivery(notices[0]))?.acknowledgedAt)).toBe(true);
  await other.getByRole("button", {name: "通知", exact: true}).first().click();
  const center = other.locator(".notification-center");
  await expect(center.locator(".notification-center__item")).toHaveCount(2);
  await expect(center).toContainText("更正后的第二版通知");
  await expect.poll(async () => (await durable(other)).length).toBe(0);
  expect((await delivery(notices[1])).acknowledgedAt).toBeNull();
  const beforeConfirm = await delivery(notices[2]);
  expect(beforeConfirm.revision).toBe(2);
  expect(beforeConfirm.acknowledgedAt).toBeNull();
  await center.locator(".notification-center__item").filter({hasText: revised.content})
    .getByRole("button", {name: "知道了", exact: true}).click();
  await expect.poll(async () => Boolean((await delivery(notices[2]))?.acknowledgedAt)).toBe(true);
  const finalRows = await Promise.all(notices.map(delivery));
  const repeated = await request.post(`${api}/api/v2/classroom-screens/notification-deliveries`, {
    headers: {"X-Classworks-Screen-Token": classroom.screenToken}, data: {items: replay},
  });
  expect(repeated.ok()).toBe(true);
  expect(await Promise.all(notices.map(delivery))).toEqual(finalRows);
  expect(await classroom.prisma.notificationScreenDelivery.count({where: {screenBindingId: classroom.binding.id}})).toBe(3);
  expect(screen.errors).toEqual([]);
});

test("restoring notice targets refreshes both the removed screen and the retained classroom", async ({classroom, request}) => {
  const other = await classroom.prisma.workspace.create({data: {termId: classroom.workspace.termId,
    code: "C2", name: "二班", type: "ADMIN_CLASS", members: {create: {accountId: classroom.account.id, role: "TEACHER"}}}});
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const created = await request.post(`${api}/api/v2/publications`, {headers, data: {
    type: "NOTICE", status: "PUBLISHED", content: "恢复后只保留在二班的通知", targetWorkspaceIds: [other.id],
  }});
  expect(created.status()).toBe(201);
  const original = (await created.json()).data;
  const edited = await request.patch(`${api}/api/v2/publications/${original.id}`, {headers: {...headers, "If-Match": '"1"'},
    data: {targetWorkspaceIds: [classroom.workspace.id, other.id]}});
  expect(edited.status()).toBe(200);
  const screen = await classroom.open("screen");
  await expect(screen.page.locator(".screen-notice-popup")).toContainText(original.content);
  const socket = io(api, {autoConnect: false});
  let joined = false;
  const restoredEvents = [];
  socket.on("workspaces-joined", event => { joined ||= event.workspaceIds.includes(other.id); });
  socket.on("publication.restored", event => restoredEvents.push(event));
  try {
    socket.connect();
    await expect.poll(() => socket.connected).toBe(true);
    socket.emit("join-workspaces", {workspaceIds: [other.id]});
    await expect.poll(() => joined).toBe(true);
    const restored = await request.post(`${api}/api/v2/publications/${original.id}/restore`, {
      headers: {...headers, "If-Match": '"2"'}, data: {sourceRevision: 1},
    });
    expect(restored.status()).toBe(200);
    await expect.poll(() => restoredEvents.some(event => event.content.publicationId === original.id)).toBe(true);
    await expect.poll(() => screen.frames.some(frame => frame.includes("publication.restored") && frame.includes(original.id))).toBe(true);
    await expect(screen.page.locator(".screen-notice-popup")).not.toBeVisible();
    const stored = await classroom.prisma.publicationTarget.findMany({where: {publicationId: original.id}});
    expect(stored.map(target => target.workspaceId)).toEqual([other.id]);
    expect(screen.errors).toEqual([]);
  } finally { socket.disconnect(); }
});

test("complete daily feeds show an older urgent notice beyond the first hundred records", async ({classroom, request}) => {
  const now = Date.now();
  const notices = Array.from({length: 105}, (_, i) => ({
    id: `${classroom.binding.id}-${String(i).padStart(3, "0")}`,
    type: "NOTICE", status: "PUBLISHED", isCertified: true, authorAccountId: classroom.account.id,
    title: `分页通知 ${i}`, content: i === 104 ? "超过一百条仍必须看到的紧急通知" : `次要通知 ${i}`,
    priority: i === 104 ? "URGENT" : "MINOR", contentJson: {popupEnabled: i === 104},
    publishAt: new Date(now - (i + 1) * 1000), expiresAt: new Date(now + 3600000),
  }));
  await classroom.prisma.publication.createMany({data: notices});
  await classroom.prisma.publicationTarget.createMany({data: notices.map(row => ({publicationId: row.id, workspaceId: classroom.workspace.id}))});
  // The legacy API stays paginated; both new public and screen routes accept stable cursors.
  const legacy = await request.get(`${api}/api/v2/publications/feed`, {params: {workspaceIds: classroom.workspace.id}});
  expect((await legacy.json()).data.items).toHaveLength(50);
  for (const screen of [false, true]) {
    const ids = [];
    let afterId = "";
    do {
      const response = await request.get(`${api}/api/v2/${screen ? "classroom-screens" : "publications"}/feed`, {
        headers: screen ? {"X-Classworks-Screen-Token": classroom.screenToken} : {},
        params: {afterId, limit: 50, ...(screen ? {} : {workspaceIds: classroom.workspace.id})},
      });
      expect(response.ok()).toBe(true);
      const page = (await response.json()).data;
      ids.push(...page.items.map(row => row.id));
      afterId = page.nextAfterId;
      expect(ids.length).toBeLessThanOrEqual(105);
    } while (afterId !== null);
    expect(ids).toEqual(notices.map(row => row.id));
  }
  const screen = await classroom.open("screen");
  await expect(screen.page.locator(".screen-notice-popup")).toContainText(notices.at(-1).content);
  const cachedCount = () => screen.page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith("classworks-v2-screen-feed-cache:"));
    return key ? JSON.parse(localStorage.getItem(key)).value.items.length : 0;
  });
  await expect.poll(cachedCount).toBe(105);
  expect(screen.errors).toEqual([]);
});

test("teacher notice edits and history restore stay confirmed while revoked writers remain blocked", async ({classroom, request}) => {
  const headers = {Authorization: `Bearer ${classroom.credentials.accessToken}`};
  const create = () => request.post(`${api}/api/v2/publications`, {headers, data: {
    type: "NOTICE", status: "PUBLISHED", content: "任课教师发布的通知", targetWorkspaceIds: [classroom.workspace.id],
  }});
  const created = await create();
  expect(created.status()).toBe(201);
  const initial = (await created.json()).data;
  expect(initial.isCertified).toBe(true);
  const edited = await request.patch(`${api}/api/v2/publications/${initial.id}`, {headers: {...headers, "If-Match": '"1"'}, data: {priority: "MINOR"}});
  expect(edited.status()).toBe(200);
  const minor = (await edited.json()).data;
  expect(minor.priority).toBe("MINOR");
  expect(minor.isCertified).toBe(true);
  const restored = await request.post(`${api}/api/v2/publications/${initial.id}/restore`, {headers: {...headers, "If-Match": '"2"'}, data: {sourceRevision: 1}});
  expect(restored.status()).toBe(200);
  expect((await restored.json()).data.isCertified).toBe(true);
  const revisions = await classroom.prisma.publicationRevision.findMany({where: {publicationId: initial.id}});
  expect(revisions).toHaveLength(3);
  expect(revisions.every(row => row.isCertified && row.certifiedByAccountId === classroom.account.id)).toBe(true);
  await classroom.prisma.workspaceMember.deleteMany({where: {accountId: classroom.account.id}});
  await classroom.prisma.teachingAssignment.deleteMany({where: {accountId: classroom.account.id}});
  expect((await create()).status()).toBe(403);
  const blocked = await request.patch(`${api}/api/v2/publications/${initial.id}`, {headers: {...headers, "If-Match": '"3"'}, data: {content: "无权限的修改"}});
  expect(blocked.status()).toBe(403);
  expect((await classroom.prisma.publication.findUnique({where: {id: initial.id}})).revision).toBe(3);
});

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
    expect(row.isCertified).toBe(true);
    expect(row.certifiedByAccountId).toBe(classroom.account.id);
    const revision = await classroom.prisma.publicationRevision.findUnique({where: {
      publicationId_revision: {publicationId: row.id, revision: row.revision},
    }});
    expect(revision.isCertified).toBe(true);
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
