import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

test.use({serviceWorkers: "block", storageState: {cookies: [], origins: [{origin, localStorage: [
  {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "screen"})},
  {name: "classworks-v2-screen-oobe:screen-a", value: JSON.stringify({version: 1, completed: true})},
  {name: "classworks-v2-screen-token", value: "screen-token"},
]}]}});

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
