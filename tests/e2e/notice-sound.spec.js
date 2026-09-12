import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

test.use({serviceWorkers: "block", storageState: {cookies: [], origins: [{origin, localStorage: [
  {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "screen"})},
  {name: "classworks-v2-screen-oobe:screen-a", value: JSON.stringify({version: 1, completed: true})},
  {name: "classworks-v2-screen-token", value: "screen-token"},
]}]}});

test("screen notice bar stays collapsed on refresh/removal and expands for new notices and revisions", async ({page, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  // The shared fixture retains withdrawn rows; the production feed excludes them.
  await page.route("**/classroom-screens/feed?*", async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.items = json.data.items.filter(item => item.status === "PUBLISHED");
    await route.fulfill({response, json});
  });
  const createNotice = async (content, priority = "MINOR") => {
    const response = await request.post(`${api}/api/v2/publications`, {data: {
      type: "NOTICE", priority, content, contentJson: {popupEnabled: false},
    }});
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
  };
  const original = await createNotice("折叠栏的原有通知");
  await request.post(`${api}/api/v2/publications`, {data: {
    type: "ASSIGNMENT", subjectId: "math", content: "折叠后作业仍然显示",
  }});
  await page.goto(origin);
  const bar = page.locator(".feed-notices");
  const collapse = () => bar.getByRole("button", {name: "折叠通知栏", exact: true});
  const expand = () => bar.getByRole("button", {name: "展开通知栏", exact: true});
  await expect(bar.getByText(original.content, {exact: true})).toBeVisible();
  await collapse().click();
  await expect(expand()).toHaveAttribute("aria-expanded", "false");
  await expect(bar.getByText(original.content, {exact: true})).toBeHidden();
  await expect(page.locator(".organized-homework-feed").getByText("折叠后作业仍然显示", {exact: true})).toBeVisible();
  // A completed refresh containing the same notices must preserve the choice.
  const refresh = page.waitForResponse(response => response.url().includes("/classroom-screens/feed"));
  await page.locator(".screen-toolbar").getByRole("button", {name: "刷新", exact: true}).click();
  await refresh;
  await expect(page.locator(".classroom-screen-view > .v-progress-linear")).toBeHidden();
  await expect(expand()).toBeVisible();
  await expand().click();
  await expect(bar.getByText(original.content, {exact: true})).toBeVisible();

  for (const priority of ["MINOR", "NORMAL", "IMPORTANT", "URGENT"]) {
    await collapse().click();
    const notice = await createNotice(`新到达的${priority}通知`, priority);
    await expect(collapse()).toHaveAttribute("aria-expanded", "true");
    if (priority === "MINOR") {
      await expect(page.locator(".screen-notice-popup")).toBeHidden();
    } else {
      const popup = page.locator(".screen-notice-popup");
      await expect(popup).toContainText(notice.content);
      await popup.getByRole("button", {name: "知道了", exact: true}).click();
      await expect(popup).toBeHidden();
    }
    await expect(bar.getByText(original.content, {exact: true})).toBeVisible();
  }

  await collapse().click();
  const updated = await request.patch(`${api}/api/v2/publications/${original.id}`, {
    headers: {"If-Match": `"${original.revision}"`}, data: {content: "原有通知更正后的内容"},
  });
  expect(updated.ok()).toBe(true);
  await expect(bar.getByText("原有通知更正后的内容", {exact: true})).toBeVisible();
  await collapse().click();
  const withdrawn = await request.patch(`${api}/api/v2/publications/${original.id}`, {
    headers: {"If-Match": `"${(await updated.json()).data.revision}"`}, data: {status: "WITHDRAWN"},
  });
  expect(withdrawn.ok()).toBe(true);
  await expect(bar.getByText("原有通知更正后的内容", {exact: true})).toHaveCount(0);
  await expect(expand()).toHaveAttribute("aria-expanded", "false");
});

test("confirmation pending state is shared by popup and center and blocks repeated intake", async ({page, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  await page.goto(origin);
  await page.getByRole("button", {name: "通知", exact: true}).first().click();
  const center = page.locator(".notification-center");
  await expect(center).toContainText("当前 0 条");
  const response = await request.post(`${api}/api/v2/publications`, {data: {type: "NOTICE", content: "确认处理中验证"}});
  const notice = (await response.json()).data;
  const key = `classworks-v2-notification-delivery:${encodeURIComponent(api)}:screen-a:1`;
  const popup = page.locator(".screen-notice-popup");
  await expect(popup).toContainText(notice.content);
  await page.evaluate(async key => {
    await new Promise(resolve => {
      void navigator.locks.request(key, () => { resolve(); return new Promise(release => { window.releaseConfirmationLock = release; }); });
    });
  }, key);
  await popup.getByRole("button", {name: "知道了", exact: true}).dblclick();
  await expect(popup.getByRole("button", {name: "正在确认", exact: true})).toBeDisabled();
  await expect(center.getByRole("button", {name: "正在确认", exact: true})).toBeDisabled();
  const intake = await page.evaluate(key => Object.keys(localStorage).filter(candidate => candidate.startsWith(`${key}:staged:`))
    .flatMap(candidate => JSON.parse(localStorage.getItem(candidate)).items).filter(item => item.acknowledged), key);
  expect(intake.map(item => item.publicationId)).toEqual([notice.id]);
  await page.evaluate(() => window.releaseConfirmationLock());
  await expect(popup).toBeHidden();
  await expect(center).toContainText("待确认 0 条");

  for (const content of ["批量确认甲", "批量确认乙"]) await request.post(`${api}/api/v2/publications`, {
    data: {type: "NOTICE", priority: "MINOR", content, contentJson: {popupEnabled: false}},
  });
  await expect(center).toContainText("待确认 2 条");
  await page.evaluate(async key => {
    await new Promise(resolve => {
      void navigator.locks.request(key, () => { resolve(); return new Promise(release => { window.releaseConfirmationLock = release; }); });
    });
  }, key);
  await center.getByRole("button", {name: "全部确认", exact: true}).click();
  await expect(center.getByRole("button", {name: "正在确认", exact: true})).toHaveCount(3);
  for (const button of await center.getByRole("button", {name: "正在确认", exact: true}).all()) await expect(button).toBeDisabled();
  await page.evaluate(() => window.releaseConfirmationLock());
  await expect(center).toContainText("待确认 0 条");
});

test("failed local confirmation shows a retryable error inside the popup", async ({page, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  await request.post(`${api}/api/v2/publications`, {data: {type: "NOTICE", content: "确认保存失败验证"}});
  await page.goto(origin);
  const popup = page.locator(".screen-notice-popup");
  await expect(popup).toContainText("确认保存失败验证");
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    window.rejectReceiptSave = true;
    Storage.prototype.setItem = function(key, value) {
      if (window.rejectReceiptSave && key.startsWith("classworks-v2-notification-delivery:")) throw new window.DOMException("full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  await page.context().setOffline(true);
  await popup.getByRole("button", {name: "知道了", exact: true}).click();
  await expect(popup.getByRole("alert")).toContainText("确认记录暂未完成本机保存，请重试");
  await expect(popup.getByRole("button", {name: "知道了", exact: true})).toBeEnabled();
  await page.evaluate(() => { window.rejectReceiptSave = false; });
  await popup.getByRole("button", {name: "知道了", exact: true}).click();
  await expect(popup).toBeHidden();
});

for (const holdLock of [false, true]) {
test(`two tabs preserve offline acknowledgements across reload without the feed (lock held: ${holdLock})`, async ({page, context, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  const notices = [];
  for (const content of ["甲页确认的通知", "乙页确认的通知"]) {
    const response = await request.post(`${api}/api/v2/publications`, {data: {type: "NOTICE", priority: "MINOR", content, contentJson: {popupEnabled: false}}});
    notices.push((await response.json()).data);
  }
  const key = `classworks-v2-notification-delivery:${encodeURIComponent(api)}:screen-a:1`;
  const read = tab => tab.evaluate(key => JSON.parse(localStorage.getItem(key))?.items || [], key);
  await page.goto(origin);
  const other = await context.newPage();
  await other.goto(origin);
  for (const tab of [page, other]) {
    await tab.getByRole("button", {name: "通知", exact: true}).first().click();
    await expect(tab.locator(".notification-center__item")).toHaveCount(2);
  }
  await expect.poll(async () => (await read(page)).length).toBe(0);
  await context.setOffline(true);
  if (holdLock) {
    await page.evaluate(key => {
      void navigator.locks.request(key, () => {
        window.receiptLockHeld = true;
        return new Promise(() => {}); // Closing the owner releases this real browser lock.
      });
    }, key);
    await expect.poll(() => page.evaluate(() => window.receiptLockHeld)).toBe(true);
  }
  await Promise.all([page, other].map((tab, index) => tab.locator(".notification-center__item")
    .filter({hasText: notices[index].content}).getByRole("button", {name: "知道了", exact: true}).click()));
  const durable = () => page.evaluate(key => Object.keys(localStorage)
    .filter(candidate => candidate === key || candidate.startsWith(`${key}:staged:`))
    .flatMap(candidate => JSON.parse(localStorage.getItem(candidate)).items), key);
  await expect.poll(async () => [...new Set((await durable()).filter(item => item.acknowledged).map(item => item.publicationId))].sort()).toEqual(notices.map(item => item.id).sort());
  if (holdLock) expect(await read(page)).toEqual([]);
  await other.close(); await page.close();
  // Remove the feed: recovery must come from the persisted queue, not UI reconstruction.
  await request.post(`${api}/__test/reset`);
  const sent = [];
  await context.route("**/notification-deliveries", route => {
    sent.push(...route.request().postDataJSON().items);
    return route.fulfill({json: {data: []}});
  });
  await context.setOffline(false);
  const restored = await context.newPage();
  await restored.goto(origin);
  await expect.poll(() => [...new Set(sent.filter(item => item.acknowledged).map(item => item.publicationId))].sort()).toEqual(notices.map(item => item.id).sort());
  await expect.poll(async () => (await read(restored)).length).toBe(0);
  await restored.close();
});
}

test("popup confirmation immediately updates an open notification center, including a new revision", async ({page, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  await page.goto(origin);
  await page.getByRole("button", {name: "通知", exact: true}).first().click();
  const center = page.locator(".notification-center");
  await expect(center).toContainText("当前 0 条");
  const response = await request.post(`${api}/api/v2/publications`, {data: {
    type: "NOTICE", priority: "NORMAL", content: "通知中心打开期间收到的通知",
  }});
  expect(response.ok()).toBe(true);
  const notice = (await response.json()).data;
  const popup = page.locator(".screen-notice-popup");
  await expect(popup).toContainText(notice.content);
  await expect(center).toContainText("待确认 1 条");
  await popup.getByRole("button", {name: "知道了", exact: true}).click();
  await expect(popup).toBeHidden();
  await expect(center).toBeVisible();
  await expect(center).toContainText("待确认 0 条");
  await expect(center.locator(".notification-center__item")).toContainText("已确认");
  const updated = await request.patch(`${api}/api/v2/publications/${notice.id}`, {
    headers: {"If-Match": `"${notice.revision}"`}, data: {content: "通知修改后的新版本"},
  });
  expect(updated.ok()).toBe(true);
  await expect(popup).toContainText("通知修改后的新版本");
  await expect(center).toContainText("待确认 1 条");
  await popup.getByRole("button", {name: "知道了", exact: true}).click();
  await expect(popup).toBeHidden();
  await expect(center).toContainText("待确认 0 条");
});

test("opening the center reloads confirmations saved by another tab", async ({page, context, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  await request.post(`${api}/api/v2/publications`, {data: {
    type: "NOTICE", priority: "MINOR", content: "其他页面已确认的通知", contentJson: {popupEnabled: false},
  }});
  await page.goto(origin);
  await expect(page.getByRole("button", {name: "通知", exact: true}).first()).toBeVisible();
  const other = await context.newPage();
  await other.goto(origin);
  await other.getByRole("button", {name: "通知", exact: true}).first().click();
  await other.locator(".notification-center").getByRole("button", {name: "知道了", exact: true}).click();
  await expect(other.locator(".notification-center")).toContainText("待确认 0 条");
  await other.close();
  await page.getByRole("button", {name: "通知", exact: true}).first().click();
  await expect(page.locator(".notification-center")).toContainText("待确认 0 条");
});

test("already open centers and popups immediately share confirmations but retain a newer revision", async ({page, context, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  await page.goto(origin);
  const other = await context.newPage();
  await other.goto(origin);
  for (const tab of [page, other]) {
    await tab.getByRole("button", {name: "通知", exact: true}).first().click();
    await expect(tab.locator(".notification-center")).toContainText("当前 0 条");
  }
  const response = await request.post(`${api}/api/v2/publications`, {data: {type: "NOTICE", content: "两页同步确认"}});
  const notice = (await response.json()).data;
  for (const tab of [page, other]) await expect(tab.locator(".screen-notice-popup")).toContainText(notice.content);
  // No feed change or reopening either center: only the other tab's storage event.
  await other.locator(".screen-notice-popup").getByRole("button", {name: "知道了", exact: true}).click();
  for (const tab of [page, other]) {
    await expect(tab.locator(".screen-notice-popup")).toBeHidden();
    await expect(tab.locator(".notification-center")).toContainText("待确认 0 条");
  }
  const updated = await request.patch(`${api}/api/v2/publications/${notice.id}`, {
    headers: {"If-Match": '"1"'}, data: {content: "第二版仍须确认"},
  });
  expect(updated.ok()).toBe(true);
  for (const tab of [page, other]) await expect(tab.locator(".screen-notice-popup")).toContainText("第二版仍须确认");
  await other.evaluate(id => {
    localStorage.setItem("classworks-v2-notification-acknowledged:another-screen", JSON.stringify([`${id}:2`]));
    localStorage.setItem("classworks-v2-notification-acknowledged:screen-a", JSON.stringify([`${id}:1`, "unrelated:1"]));
  }, notice.id);
  await expect(page.locator(".screen-notice-popup")).toContainText("第二版仍须确认");
  await other.locator(".screen-notice-popup").getByRole("button", {name: "知道了", exact: true}).click();
  await expect(page.locator(".screen-notice-popup")).toBeHidden();
  await expect(page.locator(".notification-center")).toContainText("待确认 0 条");
});

test("delivery refresh is disabled while loading and recovers after a request failure", async ({browser, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  await request.post(`${api}/api/v2/publications`, {data: {type: "NOTICE", content: "送达状态刷新验证"}});
  const context = await browser.newContext({serviceWorkers: "block", storageState: {cookies: [], origins: [{origin, localStorage: [
    {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "teacher"})},
    {name: "classworks-v2-access-token", value: "teacher-token"},
    {name: "classworks-v2-refresh-token", value: "teacher-refresh"},
  ]}]}});
  try {
    const page = await context.newPage();
    const held = [];
    await page.route("**/publications/*/screen-deliveries", route => { held.push(route); });
    await page.goto(origin);
    await page.locator(".publication-list-item button").filter({has: page.locator(".mdi-dots-vertical")}).click();
    await page.getByText("查看大屏送达状态", {exact: true}).click();
    const dialog = page.getByRole("dialog").filter({hasText: "大屏送达状态"});
    const refresh = dialog.getByRole("button", {name: "刷新", exact: true});
    await expect.poll(() => held.length).toBe(1);
    await expect(refresh).toBeDisabled();
    await held[0].fulfill({status: 503, json: {message: "测试临时故障"}});
    await expect(dialog).toContainText("测试临时故障");
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await expect.poll(() => held.length).toBe(2);
    await expect(refresh).toBeDisabled();
    await held[1].fulfill({json: {data: {revision: 1, screens: [{binding: {id: "screen-a", name: "测试大屏"},
      delivery: {revision: 1, acknowledgedAt: new Date().toISOString()}}]}}});
    await expect(dialog).toContainText("当前版本已由大屏确认");
    await expect(refresh).toBeEnabled();
  } finally { await context.close(); }
});

test("a batch of 105 confirmed notices stays confirmed and silent after screen reload", async ({page, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  for (let i = 0; i < 105; i++) {
    await request.post(`${api}/api/v2/publications`, {data: {type: "NOTICE", priority: "MINOR",
      content: `批量通知 ${i}`, contentJson: {popupEnabled: false}, expiresAt: new Date(Date.now() + 3600000).toISOString()}});
  }
  await page.addInitScript(() => {
    window.noticeSounds = [];
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    window.HTMLMediaElement.prototype.play = function () { window.noticeSounds.push(this.src); return Promise.resolve(); };
  });
  await page.goto(origin);
  await expect.poll(() => page.evaluate(() => window.noticeSounds.length)).toBe(1);
  await page.getByRole("button", {name: "通知", exact: true}).first().click();
  const center = page.locator(".notification-center");
  await expect(center).toContainText("当前 105 条");
  await center.getByRole("button", {name: "全部确认", exact: true}).click();
  await expect(center).toContainText("待确认 0 条");
  // Move beyond the separate short alert claim so it cannot hide a lost seen record.
  await page.clock.install({time: new Date(Date.now() + 31000)});
  await page.reload();
  await expect(page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
  await page.getByRole("button", {name: "通知", exact: true}).first().click();
  await expect(center).toContainText("待确认 0 条");
  expect(await page.evaluate(() => window.noticeSounds)).toEqual([]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("classworks-v2-notification-acknowledged:screen-a")));
  expect(saved).toHaveLength(105);
});

test("editing a published normal notice to minor persists the selected priority before screen startup", async ({browser, page, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  const created = await request.post(`${api}/api/v2/publications`, {data: {
    type: "NOTICE", priority: "NORMAL", content: "需要改为次要的通知", contentJson: {popupEnabled: true},
  }});
  const notice = (await created.json()).data;
  const teacher = await browser.newContext({serviceWorkers: "block", storageState: {cookies: [], origins: [{origin, localStorage: [
    {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "teacher"})},
    {name: "classworks-v2-access-token", value: "teacher-token"},
    {name: "classworks-v2-refresh-token", value: "teacher-refresh"},
  ]}]}});
  try {
    const editor = await teacher.newPage();
    await editor.goto(origin);
    const row = editor.locator(".publication-list-item").filter({hasText: notice.content});
    await row.locator("button").filter({has: editor.locator(".mdi-dots-vertical")}).click();
    await editor.getByText("编辑", {exact: true}).click();
    const composer = editor.locator(".publication-composer");
    await composer.locator(".v-select").filter({hasText: "优先级"}).click();
    await editor.getByRole("option", {name: "次要", exact: true}).click();
    const saved = editor.waitForResponse(response => response.url() === `${api}/api/v2/publications/${notice.id}` && response.request().method() === "PATCH");
    await composer.getByRole("button", {name: "保存修改", exact: true}).click();
    const response = await saved;
    expect(response.request().postDataJSON().priority).toBe("MINOR");
    expect((await response.json()).data.priority).toBe("MINOR");
    await page.goto(origin);
    const popup = page.locator(".screen-notice-popup");
    await expect(popup).toContainText(notice.content);
    await expect(popup).toContainText("次要");
  } finally { await teacher.close(); }
});

for (const engine of ["web-audio", "media"]) {
  test(`minor notice received on screen startup uses Teams default through ${engine}`, async ({page, request}) => {
    await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
    await request.post(`${api}/__test/reset`);
    await request.post(`${api}/api/v2/publications`, {data: {
      type: "NOTICE", priority: "MINOR", content: "大屏上线前发布的次要通知", contentJson: {popupEnabled: true},
    }});
    await page.addInitScript(engine => {
      window.noticeSounds = [];
      window.HTMLMediaElement.prototype.play = function () {
        window.noticeSounds.push(decodeURIComponent(new URL(this.src).pathname));
        return Promise.resolve();
      };
      window.webkitAudioContext = undefined;
      window.AudioContext = engine === "media" ? undefined : class {
        state = "running";
        destination = {};
        decodeAudioData() { return {}; }
        createBufferSource() { return {connect: node => node, start() {}}; }
        createGain() { return {gain: {}, connect: node => node}; }
        createDynamicsCompressor() {
          return {threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: node => node};
        }
      };
      const fetch = window.fetch;
      window.fetch = (...args) => {
        const path = decodeURIComponent(new URL(args[0], window.location.href).pathname);
        if (path.startsWith("/sounds/")) window.noticeSounds.push(path);
        return fetch(...args);
      };
    }, engine);
    await page.goto(origin);
    await expect(page.locator(".screen-notice-popup")).toContainText("大屏上线前发布的次要通知");
    await expect.poll(() => page.evaluate(() => window.noticeSounds)).toEqual(["/sounds/Teams 默认.mp3"]);
    await page.locator(".screen-notice-popup").getByRole("button", {name: "知道了", exact: true}).click();
    await page.reload();
    await expect(page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
    expect(await page.evaluate(() => window.noticeSounds)).toEqual([]);
  });
}
