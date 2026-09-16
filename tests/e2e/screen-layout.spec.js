import {test, expect} from "@playwright/test";
import {api, origin} from "./environment.js";
import {preparationToday} from "../../src/utils/homeworkPreparation.js";

test("screen layout preserves dock access, full long homework and expandable context across viewport sizes", async ({browser, request}, testInfo) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  const date = preparationToday();
  const content = Array.from({length: 12}, (_, i) => `第 ${i + 1} 项：完成练习并写出完整步骤，核对答案与单位。`).join("\n");
  for (const [index, name] of ["数学", "语文", "英语", "物理", "化学", "生物"].entries()) {
    const created = await request.post(`${api}/api/v2/publications`, {data: {boardDate: date, subjectId: "math",
      title: `${name}练习`, content: index ? `${name}：完成今日练习，订正错题。` : content,
      contentJson: index ? null : {optionalContent: "拓展题任选一题。", submission: "交课代表", preparation: {date, text: "圆规、实验报告"}},
    }});
    expect(created.ok()).toBe(true);
    const item = (await created.json()).data;
    await request.patch(`${api}/api/v2/publications/${item.id}`, {headers: {"If-Match": '"1"'}, data: {subject: {id: name, name}}});
  }
  const values = {"classworks-v2-screen-token": "screen-token",
    "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: "screen"}),
    "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true})};
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, serviceWorkers: "block",
    storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}});
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(origin);
    const cards = page.locator(".publication-grid-item");
    await expect(cards).toHaveCount(6);
    const long = cards.filter({hasText: "第 12 项"});
    const short = cards.filter({hasText: "语文练习"});
    await expect.poll(async () => (await long.boundingBox()).width / (await short.boundingBox()).width).toBeGreaterThan(1.8);
    await expect.poll(() => long.evaluate(card => {
      const requiredSize = window.getComputedStyle(card.querySelector(".publication-content")).fontSize;
      return [...card.querySelectorAll(".submission-details")].every(item => window.getComputedStyle(item).fontSize === requiredSize);
    })).toBe(true);
    await page.locator(".subject-status-summary").click();
    await expect(page.locator(".subject-status--compact")).toContainText("6 项作业");
    await page.locator(".subject-status-summary").click();
    await page.locator(".preparation-summary").click();
    await expect(page.locator(".preparation-board__item")).toContainText("圆规、实验报告");
    await page.locator(".preparation-summary").click();
    await page.evaluate(() => window.scrollTo({top: 0, behavior: "instant"}));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({path: testInfo.outputPath("screen-layout-wide.png")});
    await long.getByRole("button", {name: "放大查看", exact: true}).click();
    await expect(page.locator(".screen-homework-focus")).toContainText("第 12 项");
    await page.keyboard.press("Escape");
    await expect(page.locator(".screen-homework-focus")).toBeHidden();
    await expect(long.getByRole("button", {name: "放大查看", exact: true})).toBeFocused();
    const dock = page.locator(".screen-action-dock");
    await expect(dock.getByRole("button")).toHaveCount(9);
    for (const position of ["left", "center", "right"]) {
      await page.evaluate(position => localStorage.setItem("classworks-v2-screen-display:screen-a", JSON.stringify({actionPosition: position, antiBurnInShift: true})), position);
      await page.reload();
      await expect(dock).toHaveClass(new RegExp(`screen-action-dock--${position}`));
      await expect(cards).toHaveCount(6);
      await page.evaluate(() => window.scrollTo({top: 0, behavior: "instant"}));
      await expect.poll(() => dock.evaluate(bar => {
        const bounds = bar.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
      })).toBe(true);
    }
    const dayInput = page.getByLabel("选择日期");
    await dock.getByTitle("前一天", {exact: true}).click();
    await expect(dayInput).not.toHaveValue(date);
    await dock.getByRole("button", {name: "今天", exact: true}).click();
    await expect(dayInput).toHaveValue(date);
    await expect(cards).toHaveCount(6);
    for (const width of [1920, 1366, 540]) {
      await page.setViewportSize({width, height: 900});
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(() => page.evaluate(() => {
        // Card heights settle after the viewport change via ResizeObserver.
        window.scrollTo(0, document.documentElement.scrollHeight);
        const bar = document.querySelector(".screen-action-dock").getBoundingClientRect();
        const bottom = Math.max(...Array.from(document.querySelectorAll(".publication-card"), item => item.getBoundingClientRect().bottom));
        const cards = Array.from(document.querySelectorAll(".publication-card"), item => item.getBoundingClientRect());
        const separate = cards.every((card, index) => card.width > 200 && card.height > 50 && cards.slice(index + 1).every(other =>
          card.right <= other.left || other.right <= card.left || card.bottom <= other.top || other.bottom <= card.top));
        return separate && document.documentElement.scrollWidth <= window.innerWidth && bar.left >= 0 && bar.right <= window.innerWidth
          && bar.top >= 0 && bar.bottom <= window.innerHeight && bottom < bar.top;
      })).toBe(true);
    }
    await page.screenshot({path: testInfo.outputPath("screen-layout-narrow.png"), fullPage: true});
    await dock.getByTitle("通知中心", {exact: true}).click();
    await expect(page.getByRole("dialog")).toContainText("通知");
    await page.keyboard.press("Escape");
    await page.setViewportSize({width: 1920, height: 1080});
    await expect.poll(async () => (await long.boundingBox()).width / (await short.boundingBox()).width).toBeGreaterThan(1.8);
    // Advance one real anti-burn-in interval: the board and dock still shift,
    // but scrolling must not move the dock out of the viewport.
    await page.clock.install();
    await page.reload();
    await expect(cards).toHaveCount(6);
    await expect(page.locator(".classworks-app-bar")).toContainText("NPClassworks 作业板");
    await expect(page.locator(".classworks-app-bar")).toContainText("热爱创造奇迹。");
    await page.clock.fastForward(5 * 60 * 1000);
    await expect(page.locator(".classroom-screen-view")).toHaveCSS("left", "1px");
    await expect(dock.locator(".screen-action-dock__surface")).toHaveCSS("left", "1px");
    for (const top of [0, 100_000]) {
      await page.evaluate(top => window.scrollTo({top, behavior: "instant"}), top);
      await expect.poll(() => dock.evaluate(bar => {
        const bounds = bar.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
      })).toBe(true);
    }
    await page.evaluate(() => localStorage.setItem("classworks-v2-screen-display:screen-a", JSON.stringify({columns: "3"})));
    await page.reload();
    await expect(cards).toHaveCount(6);
    await expect.poll(async () => Math.abs((await long.boundingBox()).width - (await short.boundingBox()).width)).toBeLessThan(2);
    const attendanceButton = dock.getByRole("button", {name: "录入考勤", exact: true});
    for (const enabled of [false, true]) {
      await page.evaluate(enabled => {
        localStorage.setItem("classworks-v2-classroom-tools:screen-a", JSON.stringify({enabledToolIds: enabled ? ["attendance", "noise"] : ["noise"]}));
        window.dispatchEvent(new CustomEvent("classworks-v2-classroom-tools-changed", {detail: {bindingId: "screen-a"}}));
      }, enabled);
      await expect(attendanceButton).toHaveCount(enabled ? 1 : 0);
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("screen keeps an active filter clearable when a feed update leaves only one subject", async ({browser, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
  await request.post(`${api}/__test/reset`);
  const rows = [];
  for (const [subjectId, name] of [["math", "数学"], ["english", "英语"]]) {
    const response = await request.post(`${api}/api/v2/publications`, {data: {
      type: "ASSIGNMENT", subjectId: "math", content: `${name}筛选回归`,
    }});
    expect(response.ok()).toBe(true);
    const row = (await response.json()).data;
    const updated = await request.patch(`${api}/api/v2/publications/${row.id}`, {
      headers: {"If-Match": `"${row.revision}"`}, data: {subjectId, subject: {id: subjectId, name}},
    });
    expect(updated.ok()).toBe(true);
    rows.push((await updated.json()).data);
  }
  const context = await browser.newContext({serviceWorkers: "block", storageState: {cookies: [], origins: [{origin, localStorage: [
    {name: "classworks-v2-screen-token", value: "screen-token"},
    {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "screen"})},
    {name: "classworks-v2-screen-oobe:screen-a", value: JSON.stringify({version: 1, completed: true})},
  ]}]}});
  try {
    const page = await context.newPage();
    await page.route("**/classroom-screens/feed?*", async route => {
      const response = await route.fetch(), json = await response.json();
      json.data.items = json.data.items.filter(item => item.status === "PUBLISHED");
      await route.fulfill({response, json});
    });
    await page.goto(origin);
    const filters = page.locator(".screen-filter-disclosure");
    await filters.locator("summary").click();
    const subjectSelect = filters.locator(".feed-control-select").filter({hasText: "科目"});
    await subjectSelect.locator(".v-field").click();
    await page.getByRole("option", {name: "数学", exact: true}).click();
    await expect(filters.locator("summary")).toContainText("已启用筛选");
    await expect(page.locator(".publication-grid-item")).toHaveCount(1);
    const removed = rows[1];
    const refresh = page.waitForResponse(response => response.url().includes("/classroom-screens/feed"));
    expect((await request.patch(`${api}/api/v2/publications/${removed.id}`, {
      headers: {"If-Match": `"${removed.revision}"`}, data: {status: "WITHDRAWN"},
    })).ok()).toBe(true);
    await refresh;
    await expect(page.locator(".classroom-screen-view > .v-progress-linear")).toBeHidden();
    await expect(subjectSelect).toBeHidden();
    await expect(filters.locator("summary")).toContainText("已启用筛选");
    await filters.getByRole("button", {name: "清除", exact: true}).click();
    await expect(page.locator(".publication-grid-item")).toHaveCount(1);
    await expect(page.getByText("已启用筛选", {exact: false})).toHaveCount(0);
  } finally { await context.close(); }
});
