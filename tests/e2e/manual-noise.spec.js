import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";

test.use({serviceWorkers: "block", permissions: ["microphone"], storageState: {cookies: [], origins: [{origin, localStorage: [
  {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "screen"})},
  {name: "classworks-v2-screen-oobe:screen-a", value: JSON.stringify({version: 1, completed: true})},
  {name: "classworks-v2-screen-token", value: "screen-token"},
  {name: "classworks-v2-noise-schedule:screen-a", value: JSON.stringify({enabled: false})},
]}]}});

test.beforeEach(async ({page, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  await page.clock.install({time: new Date("2026-09-09T08:00:00+08:00")});
  await page.addInitScript(() => {
    window.noiseFixture = {starts: 0, stopped: 0, closed: 0, port: null};
    const node = () => ({connect() {}, frequency: {}, gain: {}});
    window.AudioContext = class {
      state = "running";
      audioWorklet = {addModule: async () => {}};
      createMediaStreamSource() { return node(); }
      createBiquadFilter() { return node(); }
      createGain() { return node(); }
      close() { window.noiseFixture.closed++; return Promise.resolve(); }
    };
    window.AudioWorkletNode = class {
      constructor() { this.port = {}; window.noiseFixture.port = this.port; }
      connect() {}
    };
    navigator.mediaDevices.getUserMedia = async () => {
      window.noiseFixture.starts++;
      const track = Object.assign(new window.EventTarget(), {stop() { window.noiseFixture.stopped++; }, getSettings: () => ({})});
      return {getTracks: () => [track], getAudioTracks: () => [track]};
    };
  });
  await page.route(`${api}/api/v2/classroom-screens/students`, route => route.fulfill({json: {data: []}}));
  await page.route(`${api}/api/v2/classroom-screens/attendance/*`, route => route.fulfill({json: {data: {absent: [], late: [], excluded: []}}}));
});

async function startManual(page) {
  await page.goto(origin);
  await page.getByRole("button", {name: "课堂工具", exact: true}).first().click();
  await page.locator(".tool-entry").filter({hasText: "噪声监测"}).click();
  await page.getByRole("button", {name: "开始监测", exact: true}).click();
  await expect(page.getByRole("button", {name: "停止手动监测", exact: true}).last()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.noiseFixture.starts)).toBe(1);
  await expect.poll(() => page.evaluate(() => Boolean(window.noiseFixture.port?.onmessage))).toBe(true);
}
async function leaveTool(page) {
  await page.getByTitle("返回课堂工具", {exact: true}).click();
  await page.getByTitle("关闭", {exact: true}).click();
}
async function sample(page) {
  await page.evaluate(() => window.noiseFixture.port?.onmessage?.({data: {rms: 0.001, peak: 0.001}}));
}
async function historyCount(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = window.indexedDB.open("classworks-noise-history", 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction("slices", "readonly").objectStore("slices").count();
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }));
}

test("manual monitoring continues recording after closing tools, reopens without restarting, and stops from the board", async ({page}) => {
  await startManual(page);
  await page.clock.runFor(31000); await sample(page);
  await expect.poll(() => historyCount(page)).toBe(1);
  await leaveTool(page);
  const status = page.locator(".screen-noise-status");
  await expect(status).toContainText("噪声监测中 · 手动");
  await page.clock.runFor(31000); await sample(page);
  await expect.poll(() => historyCount(page)).toBe(2);
  expect(await page.evaluate(() => window.noiseFixture.stopped)).toBe(0);
  await status.getByRole("button", {name: "查看噪声监测"}).click();
  await expect(page.getByRole("button", {name: "停止手动监测", exact: true}).last()).toBeVisible();
  expect(await page.evaluate(() => window.noiseFixture.starts)).toBe(1);
  await leaveTool(page);
  await status.getByRole("button", {name: "停止手动监测"}).click();
  await expect(status).toBeHidden();
  expect(await page.evaluate(() => window.noiseFixture.stopped)).toBe(1);
});

test("manual monitoring forcibly ends at three hours after leaving the tool", async ({page}) => {
  await startManual(page);
  await leaveTool(page);
  await page.clock.fastForward(179 * 60 * 1000);
  await expect(page.locator(".screen-noise-status")).toContainText("噪声监测中");
  expect(await page.evaluate(() => window.noiseFixture.stopped)).toBe(0);
  await page.clock.fastForward(60 * 1000);
  await expect(page.locator(".screen-noise-status")).toContainText("手动监测已满三小时，已自动停止");
  expect(await page.evaluate(() => window.noiseFixture.stopped)).toBe(1);
  expect(await page.evaluate(() => window.noiseFixture.closed)).toBe(1);
});

test("refreshing does not silently resume the previous manual session", async ({page}) => {
  await startManual(page);
  await leaveTool(page);
  await page.reload();
  await expect(page.getByRole("button", {name: "录入作业", exact: true}).first()).toBeVisible();
  await expect(page.locator(".screen-noise-status")).toBeHidden();
  expect(await page.evaluate(() => window.noiseFixture.starts)).toBe(0);
});

for (const endTime of ["10:00", "12:00"]) {
  test(`manual and scheduled overlap uses one stream with schedule ending at ${endTime}`, async ({page}) => {
    await startManual(page);
    await leaveTool(page);
    await page.evaluate(endTime => {
      localStorage.setItem("classworks-v2-noise-schedule:screen-a", JSON.stringify({enabled: true, startTime: "09:00", endTime}));
      window.dispatchEvent(new window.CustomEvent("classworks-noise-schedule-settings-changed", {detail: {bindingId: "screen-a"}}));
    }, endTime);
    await page.clock.fastForward(61 * 60 * 1000);
    const status = page.locator(".screen-noise-status");
    await expect(status).toContainText("手动＋定时");
    if (endTime === "10:00") {
      await page.clock.fastForward(60 * 60 * 1000);
      await expect(status).toContainText("噪声监测中 · 手动 ·");
      expect(await page.evaluate(() => window.noiseFixture.stopped)).toBe(0);
      await page.clock.fastForward(59 * 60 * 1000);
      await expect(status).toContainText("手动监测已满三小时，已自动停止");
    } else {
      await page.clock.fastForward(119 * 60 * 1000);
      await expect(status).toContainText("手动模式已结束；定时监测继续至 12:00");
      await expect(status.getByRole("button", {name: "停止手动监测"})).toHaveCount(0);
      expect(await page.evaluate(() => window.noiseFixture.stopped)).toBe(0);
      await page.clock.fastForward(60 * 60 * 1000);
      await expect(status).toContainText("已自动停止");
    }
    expect(await page.evaluate(() => window.noiseFixture.starts)).toBe(1);
    expect(await page.evaluate(() => window.noiseFixture.stopped)).toBe(1);
  });
}
