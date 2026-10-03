/* global innerWidth, innerHeight */
import {chromium} from "@playwright/test";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";

const origin = "http://127.0.0.1:4180";
const api = "http://127.0.0.1:4181";
const output = path.resolve("docs/ui4-optimization-20261003");
await mkdir(output, {recursive: true});

const school = {id: "school", name: "示例中学", code: "E2E",
  terms: [{id: "term", name: "2026 学年秋季", status: "ACTIVE"}]};
const classroom = {id: "class-a", name: "高一（1）班", code: "C1", type: "ADMIN_CLASS",
  members: [], pendingInvitations: []};
const screen = {id: "screen-a", name: "高一（1）班一体机", loginCode: "class-1",
  administrativeClassId: "class-a", administrativeClass: classroom, isActive: true, dutyState: "ONLINE",
  deviceFingerprint: "fixture-device", lastHeartbeatAt: "2026-10-03T00:00:00Z",
  runtimeStatus: {appVersion: "1.2.0", syncState: "synced", pendingUploads: 0}};
const quickDeadlines = [
  {label: "明早 7:30", dayOffset: 1, time: "07:30"},
  {label: "明天 12:00", dayOffset: 1, time: "12:00"},
  {label: "明晚 18:00", dayOffset: 1, time: "18:00"},
  {label: "后早 7:30", dayOffset: 2, time: "07:30"},
  {label: "下周一 7:30", dateRule: "next-weekday", weekday: 1, time: "07:30"},
];

const browser = await chromium.launch({headless: true});
const measurements = [];
try {
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const context = await browser.newContext({viewport: {width, height}, serviceWorkers: "block",
      timezoneId: "Asia/Shanghai", storageState: {cookies: [], origins: [{origin, localStorage: [
        {name: "classworks-v2-access-token", value: "admin-token"},
        {name: "classworks-v2-refresh-token", value: "admin-refresh"},
        {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "teacher"})},
      ]}]}});
    const reply = (route, data) => route.fulfill({json: {data}});
    await context.route(`${api}/accounts/local/status`, route => reply(route, {bootstrapRequired: false}));
    await context.route(url => url.origin === api && url.pathname === "/api/v2/me/schools",
      route => reply(route, [{role: "ADMIN", school}]));
    await context.route(`${api}/api/v2/admin/**`, route => {
      const endpoint = new URL(route.request().url()).pathname;
      if (endpoint.endsWith("/classroom-screens")) return reply(route, [screen]);
      if (endpoint.endsWith("/workspace-memberships")) return reply(route, {workspaces: [classroom]});
      if (endpoint.endsWith("/homework-settings")) return reply(route, {quickDeadlines, quickInputs: []});
      if (endpoint.endsWith("/local-accounts")) return reply(route, []);
      if (endpoint.endsWith("/staff-responsibilities")) return reply(route,
        {policy: {}, people: [], grades: [], administrativeClasses: []});
      return route.fulfill({status: 404, json: {message: `未配置的夹具：${endpoint}`}});
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-10-03T08:00:00+08:00"));
    await page.goto(`${origin}/classworks-admin?section=screens&school=school&term=term`);
    await page.locator(".admin-entity-list .v-list-item").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const label = width === 1440 ? "admin-screens-1440" : "admin-screens-390";
    await page.screenshot({path: path.join(output, `${label}.png`), animations: "disabled"});
    if (width === 1440) {
      await page.screenshot({path: path.join(output, `${label}-full.png`),
        fullPage: true, animations: "disabled"});
    }
    const data = await page.evaluate(() => {
      const bounds = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return {x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width),
          height: Math.round(box.height)};
      };
      return {viewport: {width: innerWidth, height: innerHeight},
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        scope: bounds(".admin-screen-scope"), list: bounds(".admin-entity-list"),
        firstDevice: bounds(".admin-entity-list .v-list-item"),
        deadline: bounds(".quick-deadline-row"), createButton: bounds(".v-card-title .bg-primary")};
    });
    await page.getByRole("button", {name: "创建大屏账号", exact: true}).click();
    await page.getByRole("dialog").filter({hasText: "创建大屏账号"}).waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({path: path.join(output, `admin-create-${width}.png`),
      animations: "disabled"});
    measurements.push({name: label, ...data, errors});
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(path.join(output, "measurements.json"), JSON.stringify(measurements, null, 2));
for (const result of measurements) console.log(JSON.stringify(result));
