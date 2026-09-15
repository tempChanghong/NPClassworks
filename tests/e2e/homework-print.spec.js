import {test, expect} from "@playwright/test";
import {origin, api} from "./environment.js";
import {readFile} from "node:fs/promises";

const date = "2026-09-06";
async function openBoard(browser, role) {
  const values = {
    "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
    ...(role === "screen" ? {
      "classworks-v2-screen-token": "screen-token",
      "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true}),
    } : {"classworks-v2-student-selection": JSON.stringify({schoolId: "school", administrativeClassId: "class-a",
      administrativeClassName: "高一一班", courseGroupIds: {}, declinedSubjectIds: []})}),
  };
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, serviceWorkers: "allow",
    storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}});
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  await page.getByLabel("选择日期").fill(date);
  return {page, context, errors};
}

async function seed(request, data) {
  const response = await request.post(`${api}/api/v2/publications`, {data: {
    type: "ASSIGNMENT", boardDate: date, publishAt: "2026-01-01T00:00:00Z",
    subjectId: "math", targetWorkspaceIds: ["class-a"], title: "数学练习", ...data,
  }});
  expect(response.ok()).toBe(true);
  return (await response.json()).data;
}

async function preview(page, role) {
  if (role === "screen") {
    await page.getByRole("button", {name: "更多", exact: true}).click();
    await page.getByText("打印作业清单", {exact: true}).click();
  } else {
    await page.getByRole("button", {name: "打印作业清单", exact: true}).click();
  }
  await expect(page.getByText("作业清单预览", {exact: true})).toBeVisible();
  return page.frameLocator('iframe[title="作业清单打印预览"]');
}

test.beforeEach(async ({request}) => {
  expect((await request.post(`${origin}/__test/release`, {data: {release: "previous"}})).ok()).toBe(true);
  expect((await request.post(`${api}/__test/reset`)).ok()).toBe(true);
});

async function textPreview(page, role) {
  if (role === "screen") {
    await page.getByRole("button", {name: "更多", exact: true}).click();
    await page.getByText("复制文字清单", {exact: true}).click();
  } else await page.getByRole("button", {name: "复制文字清单", exact: true}).click();
  return page.locator(".homework-print-dialog");
}

test("text sharing copies exactly the selected subjects with instructions and no-homework state through the real clipboard", async ({browser, request}) => {
  await seed(request, {content: "第一题\n第二题", dueAt: "2026-09-07T08:00:00Z", contentJson: {optionalContent: "挑战题", submission: "交课代表", preparation: {text: "圆规", date: "2099-01-02"}}});
  const none = await seed(request, {title: "今日无作业", content: "本日该科目无作业。", contentJson: {kind: "NO_HOMEWORK", version: 1}});
  expect((await request.patch(`${api}/api/v2/publications/${none.id}`, {headers: {"If-Match": '"1"'}, data: {subject: {id: "chinese", name: "语文"}, subjectId: "chinese", isCertified: false}})).ok()).toBe(true);
  const board = await openBoard(browser, "student");
  try {
    await board.context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const dialog = await textPreview(board.page, "student"), input = dialog.getByLabel("文字清单预览", {exact: true});
    await expect(input).toHaveValue(/必做：\n第一题\n第二题/);
    for (const value of ["挑战题", "交课代表", "2099-01-02 需带：圆规", "今日无作业", "待教师确认"]) expect(await input.inputValue()).toContain(value);
    await dialog.getByRole("checkbox", {name: "语文", exact: true}).uncheck();
    await expect(input).not.toHaveValue(/今日无作业/);
    await dialog.getByRole("button", {name: "复制文字", exact: true}).click();
    await expect(dialog).toContainText("文字清单已复制");
    // Windows' native clipboard uses CRLF; textarea values normalize it to LF.
    const copied = await board.page.evaluate(() => navigator.clipboard.readText());
    expect(copied.replace(/\r\n/g, "\n")).toBe(await input.inputValue());
    await dialog.getByRole("checkbox", {name: "数学", exact: true}).uncheck();
    await expect(dialog.getByRole("button", {name: "复制文字", exact: true})).toBeDisabled();
    await expect(dialog).not.toContainText("文字清单已复制");
    await dialog.getByRole("button", {name: "打印 / 图片", exact: true}).click();
    await expect(board.page.frameLocator('iframe[title="作业清单打印预览"]').locator("body")).toContainText("今日无作业");
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("screen text sharing opens offline and clipboard denial keeps selectable text and cache warnings", async ({browser, request}) => {
  await seed(request, {content: "离线文字内容"});
  const board = await openBoard(browser, "screen");
  try {
    await expect(board.page.getByText("离线文字内容", {exact: true})).toBeVisible();
    await expect.poll(() => board.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await board.context.setOffline(true);
    await board.page.getByRole("button", {name: "刷新", exact: true}).first().click();
    await expect(board.page.getByText("当前无法连接服务器，正在显示这台大屏上次同步的内容")).toBeVisible();
    await board.page.evaluate(() => Object.defineProperty(navigator, "clipboard", {configurable: true, value: {writeText: async () => { throw new Error("denied"); }}}));
    const dialog = await textPreview(board.page, "screen"), input = dialog.getByLabel("文字清单预览", {exact: true});
    await expect(input).toHaveValue(/离线缓存内容/);
    await dialog.getByRole("button", {name: "复制文字", exact: true}).click();
    await expect(dialog).toContainText("浏览器未允许自动复制");
    await dialog.getByRole("button", {name: "全选文字", exact: true}).click();
    expect(await input.evaluate(el => el.selectionEnd - el.selectionStart)).toBe((await input.inputValue()).length);
    await expect(input).toHaveValue(/离线文字内容/);
    await expect(dialog).not.toContainText("文字清单已复制");
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("a late clipboard result cannot report success for a newly opened text preview", async ({browser, request}) => {
  await seed(request, {content: "延迟复制正文"});
  const board = await openBoard(browser, "student");
  try {
    await board.page.evaluate(() => Object.defineProperty(navigator, "clipboard", {configurable: true, value: {writeText: () => new Promise(resolve => { window.finishClipboardWrite = resolve; })}}));
    let dialog = await textPreview(board.page, "student");
    await dialog.getByRole("button", {name: "复制文字", exact: true}).click();
    await expect.poll(() => board.page.evaluate(() => typeof window.finishClipboardWrite)).toBe("function");
    await dialog.getByRole("button", {name: "关闭", exact: true}).click();
    dialog = await textPreview(board.page, "student");
    await expect(dialog.getByRole("button", {name: "复制文字", exact: true})).toBeDisabled();
    await board.page.evaluate(() => window.finishClipboardWrite());
    await expect(dialog.getByRole("button", {name: "复制文字", exact: true})).toBeEnabled();
    await expect(dialog).not.toContainText("文字清单已复制");
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("image export draws every line across PNG pages, downloads a real image and frees closed previews", async ({browser, request}, testInfo) => {
  const content = "<script>literal text</script>\n" + Array.from({length: 95}, (_, index) => `完整作业第${index + 1}行`).join("\n") + "\n最后一行😀";
  await seed(request, {content});
  await seed(request, {title: "今日无作业", content: "本日该科目无作业。", contentJson: {kind: "NO_HOMEWORK", version: 1}});
  const board = await openBoard(browser, "student");
  try {
    await preview(board.page, "student");
    await board.page.evaluate(() => {
      window.drawnHomeworkText = [];
      const draw = window.CanvasRenderingContext2D.prototype.fillText;
      window.CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        window.drawnHomeworkText.push(text); return draw.call(this, text, ...args);
      };
    });
    await board.page.getByRole("button", {name: "生成清单图片", exact: true}).click();
    const results = board.page.locator(".homework-image-results");
    await expect(results).toBeVisible();
    const images = results.locator("img");
    expect(await images.count()).toBeGreaterThan(2);
    await expect(images.first()).toHaveJSProperty("naturalWidth", 1200);
    const text = await board.page.evaluate(() => window.drawnHomeworkText);
    for (const line of content.split("\n")) expect(text).toContain(line);
    expect(text.some(line => line.includes("今日无作业"))).toBe(true);
    expect(text.some(line => line.includes("1 项作业 · 1 项无作业标记"))).toBe(true);
    const downloaded = board.page.waitForEvent("download");
    await results.getByRole("link", {name: /保存第 1 张 PNG/}).click();
    const download = await downloaded;
    const output = testInfo.outputPath("homework-image-1.png");
    await download.saveAs(output);
    expect((await readFile(output)).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const last = results.getByRole("link").last();
    const downloadedLast = board.page.waitForEvent("download");
    await last.click();
    await (await downloadedLast).saveAs(testInfo.outputPath("homework-image-last.png"));
    const url = await images.first().getAttribute("src");
    await board.page.getByRole("button", {name: "关闭", exact: true}).click();
    await expect(results).toHaveCount(0);
    expect(await board.page.evaluate(url => fetch(url).then(() => true).catch(() => false), url)).toBe(false);
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("screen first generates images offline with cached status and can cancel a pending render", async ({browser, request}) => {
  await seed(request, {content: "离线保存的图片正文"});
  const board = await openBoard(browser, "screen");
  try {
    await expect(board.page.getByText("离线保存的图片正文", {exact: true})).toBeVisible();
    await board.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => board.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await board.context.setOffline(true);
    await board.page.getByRole("button", {name: "刷新", exact: true}).first().click();
    await expect(board.page.getByText("当前无法连接服务器，正在显示这台大屏上次同步的内容")).toBeVisible();
    await preview(board.page, "screen");
    await board.page.getByRole("button", {name: "生成清单图片", exact: true}).click();
    await expect(board.page.locator(".homework-image-results img")).toHaveCount(1);
    await board.page.evaluate(() => {
      window.originalHomeworkToBlob = window.HTMLCanvasElement.prototype.toBlob;
      window.HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
        window.releaseHomeworkImage = () => window.originalHomeworkToBlob.call(this, callback, ...args);
      };
    });
    await board.page.getByRole("button", {name: "重新生成图片", exact: true}).click();
    await expect.poll(() => board.page.evaluate(() => typeof window.releaseHomeworkImage)).toBe("function");
    await board.page.getByRole("button", {name: "关闭", exact: true}).click();
    await board.page.evaluate(() => { window.releaseHomeworkImage(); window.HTMLCanvasElement.prototype.toBlob = window.originalHomeworkToBlob; });
    await preview(board.page, "screen");
    await expect(board.page.locator(".homework-image-results")).toHaveCount(0);
    await board.page.getByRole("button", {name: "生成清单图片", exact: true}).click();
    await expect(board.page.locator(".homework-image-results img")).toHaveCount(1);
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("student previews selected assignments, prints the same document and paginates long text to PDF", async ({browser, request}, testInfo) => {
  const content = '第一行\n<script>window.injected = true</script>\n' + "完整保留的长作业行\n".repeat(120) + "最后一行";
  await seed(request, {content, dueAt: "2026-09-07T10:00:00Z"});
  await seed(request, {content: "不应打印的通知", type: "NOTICE"});
  await seed(request, {content: "不应打印的其他日期", boardDate: "2026-09-05"});
  const board = await openBoard(browser, "student");
  try {
    const frame = await preview(board.page, "student");
    await expect(frame.locator(".assignment")).toHaveCount(1);
    await expect(frame.locator("header")).toContainText("高一一班");
    await expect(frame.locator("header")).toContainText(date);
    await expect(frame.locator(".content")).toHaveText(content);
    await expect(frame.locator(".details").last()).toContainText("教师已确认");
    await expect(frame.locator("script")).toHaveCount(0);
    const iframe = board.page.frames().find(candidate => candidate.parentFrame());
    await iframe.evaluate(() => { window.printCalls = 0; window.print = () => { window.printCalls++; }; });
    await board.page.getByRole("button", {name: "打印 / 保存 PDF", exact: true}).click();
    expect(await iframe.evaluate(() => window.printCalls)).toBe(1);

    // Render the identical iframe document using Chromium's print engine.
    const document = await board.page.locator(".homework-print-preview").getAttribute("srcdoc");
    const paper = await board.context.newPage();
    await paper.setViewportSize({width: 794, height: 1123});
    await paper.setContent(document);
    await paper.emulateMedia({media: "print"});
    const pdf = await paper.pdf({path: testInfo.outputPath("homework-list.pdf"), preferCSSPageSize: true});
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g).length).toBeGreaterThan(1);
    await paper.screenshot({path: testInfo.outputPath("homework-list.png")});
    await paper.close();
    await board.page.getByRole("button", {name: "关闭", exact: true}).click();
    await expect(board.page.locator(".homework-print-preview")).toHaveCount(0);
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("screen prints a cached board with an explicit offline label", async ({browser, request}) => {
  await seed(request, {content: "离线也可以打印的作业"});
  const board = await openBoard(browser, "screen");
  try {
    await expect(board.page.getByText("离线也可以打印的作业", {exact: true})).toBeVisible();
    await board.context.setOffline(true);
    await board.page.getByRole("button", {name: "刷新", exact: true}).first().click();
    await expect(board.page.getByText("当前无法连接服务器，正在显示这台大屏上次同步的内容")).toBeVisible();
    const frame = await preview(board.page, "screen");
    await expect(frame.locator(".warning")).toContainText("离线缓存内容");
    await expect(frame.locator(".content")).toHaveText("离线也可以打印的作业");
    await board.page.getByRole("button", {name: "关闭", exact: true}).click();
    await preview(board.page, "screen");
    await expect(frame.locator(".assignment")).toHaveCount(1);
    expect(board.errors).toEqual([]);
  } finally { await board.context.close(); }
});

test("empty selected day is explicit and changing date does not reuse another day's assignments", async ({browser, request}) => {
  await seed(request, {content: "只属于前一天", boardDate: "2026-09-05"});
  const board = await openBoard(browser, "student");
  try {
    const frame = await preview(board.page, "student");
    await expect(frame.locator(".assignment")).toHaveCount(0);
    await expect(frame.locator("body")).toContainText("没有该日期的作业");
    await board.page.getByRole("button", {name: "关闭", exact: true}).click();
    await board.page.getByLabel("选择日期").fill("2026-09-05");
    await preview(board.page, "student");
    await expect(frame.locator("header")).toContainText("2026-09-05");
    await expect(frame.locator(".content")).toHaveText("只属于前一天");
  } finally { await board.context.close(); }
});
