import {test, expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {createServer} from "node:http";
import {origin, api} from "./environment.js";

const presets = JSON.parse(readFileSync(new URL("../../src/utils/backgroundPresets.json", import.meta.url), "utf8"));
const legacyImage = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
test.use({storageState: {cookies: [], origins: [{origin, localStorage: [
  {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "teacher"})},
  {name: "classworks-v2-access-token", value: "teacher-token"},
  {name: "classworks-v2-refresh-token", value: "teacher-refresh"},
  {name: "classworks-v2-student-selection", value: JSON.stringify({schoolId: "school", administrativeClassId: "class-a", administrativeClassName: "高一一班", courseGroupIds: {}, declinedSubjectIds: []})},
  {name: "Classworks_settings", value: JSON.stringify({"background.enabled": true, "background.imageData": legacyImage})},
]}]}});
test.beforeEach(async ({request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
});
const button = (page, preset) => page.getByRole("button", {name: `使用背景：${preset.category} · ${preset.title}`, exact: true});
const selected = page => page.evaluate(() => JSON.parse(localStorage.getItem("Classworks_settings"))["background.selection"]);

test("a missing cached background automatically recovers after offline startup reconnects", async ({page, context}) => {
  await page.goto(`${origin}/settings`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await button(page, presets[0]).click();
  await expect(button(page, presets[0])).toBeEnabled();
  await expect(page.locator(".app-background-image")).toHaveCSS("background-image", /blob:/);
  await page.evaluate(() => caches.delete("classworks-backgrounds-v1"));
  await context.setOffline(true);
  const failed = page.waitForEvent("requestfailed", request => request.url().endsWith(presets[0].image));
  await page.reload();
  await failed;
  await expect(button(page, presets[0])).toBeVisible();
  await expect(page.locator(".app-background-image")).not.toHaveCSS("background-image", /blob:/);
  await context.setOffline(false);
  await expect(page.locator(".app-background-image")).toHaveCSS("background-image", /blob:/);
  expect(await selected(page)).toEqual({kind: "preset", id: presets[0].id});
});

test("preset gallery downloads only chosen full images and selected background survives offline reload", async ({page, context}) => {
  const downloads = [];
  page.on("request", req => { if (new URL(req.url()).pathname.includes("/backgrounds/full/")) downloads.push(req.url()); });
  await page.goto(`${origin}/settings`);
  await expect(button(page, presets[0])).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(downloads).toHaveLength(0);
  await button(page, presets[0]).click();
  await expect(button(page, presets[0])).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".app-background-image")).toHaveCSS("background-image", /blob:/);
  expect(downloads.every(url => url.endsWith(presets[0].image))).toBe(true);
  await expect(page.getByText(/并缓存供离线使用/)).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".app-background-image")).toHaveCSS("background-image", /blob:/);
  expect(await selected(page)).toEqual({kind: "preset", id: presets[0].id});
  // Model an upgrade that changed this preset's file hash while the old cached
  // image remains available. Never save old bytes under the new asset URL.
  await page.evaluate(async preset => {
    const cache = await caches.open("classworks-backgrounds-v1");
    const current = new URL(preset.image, window.location.origin).href;
    await cache.put(new URL(`backgrounds/full/${preset.id}-previous.webp`, window.location.origin).href, await cache.match(current));
    await cache.delete(current);
  }, presets[0]);
  await page.reload();
  await expect(page.locator(".app-background-image")).toHaveCSS("background-image", /blob:/);
  expect(await page.evaluate(async path => Boolean(await (await caches.open("classworks-backgrounds-v1")).match(new URL(path, window.location.origin))), presets[0].image)).toBe(false);
  await context.setOffline(false);
});

test.describe("background failure handling", () => {
  test.use({serviceWorkers: "block"});

test("a stalled response body times out, preserves the old background and permits another selection", async ({page}) => {
  const server = createServer((request, response) => {
    response.writeHead(200, {"Content-Type": "image/webp", "Access-Control-Allow-Origin": "*"});
    response.flushHeaders();
    response.write("RIFF"); // Real HTTP headers and partial body; deliberately never finish.
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto(`${origin}/settings`);
    await button(page, presets[0]).click();
    await expect(button(page, presets[0])).toBeEnabled();
    await expect(page.locator(".app-background-image")).toHaveCSS("background-image", /blob:/);
    const previous = await page.locator(".app-background-image").evaluate(element => window.getComputedStyle(element).backgroundImage);
    await page.evaluate(({path, slowUrl}) => {
      window.restoreBackgroundFetch = window.fetch.bind(window);
      window.fetch = (input, options) => window.restoreBackgroundFetch(String(input).endsWith(path) ? slowUrl : input, options);
    }, {path: presets[1].image, slowUrl: `http://127.0.0.1:${server.address().port}/slow-image`});
    await button(page, presets[1]).click();
    await expect(page.getByText("背景图片下载超时，请重试", {exact: true})).toBeVisible({timeout: 25000});
    await expect(button(page, presets[1])).toBeEnabled();
    await expect(page.locator(".app-background-image")).toHaveCSS("background-image", previous);
    expect(await selected(page)).toEqual({kind: "preset", id: presets[0].id});
    expect(await page.evaluate(async path => Boolean(await (await caches.open("classworks-backgrounds-v1")).match(new URL(path, window.location.origin))), presets[1].image)).toBe(false);
    await page.evaluate(() => { window.fetch = window.restoreBackgroundFetch; });
    await button(page, presets[1]).click();
    await expect(button(page, presets[1])).toHaveAttribute("aria-pressed", "true");
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("reconnection before failure settles retries once and a late result cannot replace a new URL", async ({page}) => {
  const pending = [];
  await page.route(`${origin}/${presets[0].image}`, route => { pending.push(route); });
  await page.addInitScript(preset => {
    const settings = JSON.parse(localStorage.getItem("Classworks_settings"));
    settings["background.selection"] = {kind: "preset", id: preset.id};
    localStorage.setItem("Classworks_settings", JSON.stringify(settings));
  }, presets[0]);
  await page.goto(`${origin}/settings`);
  await expect.poll(() => pending.length).toBe(1);
  const reconnect = () => page.evaluate(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new window.Event("online")); });
  await reconnect();
  expect(pending).toHaveLength(1);
  await pending[0].abort("failed");
  await expect.poll(() => pending.length).toBe(2);
  await reconnect();
  expect(pending).toHaveLength(2);
  await page.getByRole("button", {name: "图片网址", exact: true}).click();
  await page.getByRole("textbox", {name: "背景图片网址"}).fill(`${origin}/${presets[1].thumbnail}`);
  await page.getByRole("button", {name: "使用此网址", exact: true}).click();
  await pending[1].fulfill({status: 200, contentType: "image/webp", body: readFileSync(new URL(`../../public/${presets[0].image}`, import.meta.url))});
  await expect.poll(() => page.evaluate(async path => Boolean(await (await caches.open("classworks-backgrounds-v1")).match(new URL(path, window.location.origin))), presets[0].image)).toBe(true);
  await expect(page.locator(".app-background-image")).toHaveCSS("background-image", new RegExp(presets[1].thumbnail));
  expect(await selected(page)).toEqual({kind: "url", url: `${origin}/${presets[1].thumbnail}`});
  expect(pending).toHaveLength(2);
});
test("failed downloads and settings writes preserve the previous background; URL selection overrides legacy data", async ({page}) => {
  await page.goto(`${origin}/settings`);
  await button(page, presets[0]).click();
  await expect(button(page, presets[0])).toHaveAttribute("aria-pressed", "true");
  await page.route(`${origin}/${presets[1].image}`, route => route.abort("failed"));
  await button(page, presets[1]).click();
  await expect(page.locator(".background-preset-picker .v-alert").filter({hasText: /fetch|下载|加载/})).toBeVisible();
  expect(await selected(page)).toEqual({kind: "preset", id: presets[0].id});
  await page.unroute(`${origin}/${presets[1].image}`);
  await page.evaluate(() => {
    window.restoreBackgroundStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "Classworks_settings") throw new window.DOMException("Full", "QuotaExceededError");
      return window.restoreBackgroundStorage.call(this, key, value);
    };
  });
  await button(page, presets[1]).click();
  await expect(page.getByText(/背景设置未能保存，原背景已保留/)).toBeVisible();
  expect(await selected(page)).toEqual({kind: "preset", id: presets[0].id});
  await expect(button(page, presets[0])).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreBackgroundStorage; });
  await page.getByRole("button", {name: "图片网址", exact: true}).click();
  await page.getByRole("textbox", {name: "背景图片网址"}).fill(`${origin}/${presets[1].thumbnail}`);
  await page.getByRole("button", {name: "使用此网址", exact: true}).click();
  await expect(page.locator(".app-background-image")).toHaveCSS("background-image", new RegExp(presets[1].thumbnail));
});
});

test("preset category filters and cache capacity keep the selected image and leave homework storage alone", async ({page}, testInfo) => {
  await page.goto(`${origin}/settings`);
  await page.locator(".background-preset-picker .v-select .v-field").click();
  await page.getByRole("option", {name: "教师节", exact: true}).click();
  await expect(page.locator(".preset-card")).toHaveCount(1);
  await page.locator(".background-preset-picker .v-select .v-field").click();
  await page.getByRole("option", {name: "全部", exact: true}).click();
  await page.evaluate(() => localStorage.setItem("background-test-homework", "keep"));
  for (const preset of presets.slice(0, 4)) {
    await button(page, preset).click();
    await expect(button(page, preset)).toHaveAttribute("aria-pressed", "true");
    await expect(button(page, preset)).toBeEnabled();
  }
  const cacheKeys = await page.evaluate(async () => (await (await caches.open("classworks-backgrounds-v1")).keys()).map(key => key.url));
  expect(cacheKeys).toHaveLength(3);
  expect(cacheKeys.some(url => url.endsWith(presets[3].image))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("background-test-homework"))).toBe("keep");
  await page.screenshot({path: testInfo.outputPath("preset-gallery.png"), fullPage: true});
});
