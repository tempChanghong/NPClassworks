import test from "node:test";
import assert from "node:assert/strict";
import {planHomeworkImages, planHomeworkImagesAsync, renderHomeworkImages, wrapHomeworkImageText, HOMEWORK_IMAGE_HEIGHT} from "../src/utils/homeworkImages.js";
import {homeworkPrintSnapshot} from "../src/utils/homeworkPrint.js";
const measure = text => Array.from(text).length * 28;
const snapshot = {className: "一班", scopeLabel: "行政班与数学走班", boardDate: "2026-09-07", generatedAt: "2026/09/07 16:00",
  items: [{subject: "数学", title: "练习", targets: "数学走班", certification: "待教师确认", priority: "普通", deadline: "未设置", content: "第一行\n第二行"}]};

test("image wrapping preserves Chinese, whitespace, line breaks and emoji graphemes", () => {
  assert.deepEqual(wrapHomeworkImageText("甲乙丙\n\nAB", () => 10, 20), ["甲乙", "丙", "", "AB"]);
  assert.deepEqual(wrapHomeworkImageText("👩‍🏫甲", () => 10, 10), ["👩‍🏫", "甲"]);
  const input = "中文 and spaces    with symbols <script>";
  assert.equal(wrapHomeworkImageText(input, measure, 120).join(""), input);
});

test("long homework spans multiple images without losing any content, and every page repeats scope/date/warnings", () => {
  const content = Array.from({length: 150}, (_, i) => `作业第${i + 1}行`).join("\n") + "\n最后一行😀";
  const pages = planHomeworkImages({...snapshot, cached: true, warning: "仍有待上传作业", items: [{...snapshot.items[0], content}]}, measure);
  assert.ok(pages.length > 2);
  assert.equal(pages.flatMap(page => page.rows.filter(row => row.kind === "body").map(row => row.text)).join("\n"), content);
  for (const page of pages) {
    const header = page.headers.map(row => row.text).join("");
    assert.ok(header.includes(snapshot.className)); assert.ok(header.includes(snapshot.boardDate));
    assert.ok(header.includes(snapshot.generatedAt)); assert.ok(header.includes("离线缓存"));
    assert.ok(header.includes("仍有待上传作业"));
    assert.ok(page.rows.every(row => row.y + row.height <= HOMEWORK_IMAGE_HEIGHT - 90));
  }
  assert.ok(pages[1].rows[0].text.includes("续"));
  assert.throws(() => planHomeworkImages({...snapshot, items: [{...snapshot.items[0], content}]}, measure, 1), /未被截断/);
});

test("images keep explicit no-homework/confirmation status and do not count markers as assignments", () => {
  const data = homeworkPrintSnapshot({publications: [{id: "marker", type: "ASSIGNMENT", status: "PUBLISHED", boardDate: "2026-09-07",
    title: "今日无作业", content: "本日该科目无作业。", contentJson: {kind: "NO_HOMEWORK", version: 1}, subject: {name: "数学"},
    targets: [{workspaceId: "class", workspace: {name: "一班"}}]}], workspaceIds: ["class"], boardDate: "2026-09-07", className: "一班"});
  const [page] = planHomeworkImages(data, measure);
  assert.match(page.headers.map(row => row.text).join(""), /0 项作业 · 1 项无作业标记/);
  const body = page.rows.map(row => row.text).join("");
  assert.match(body, /今日无作业/); assert.match(body, /待教师确认/); assert.doesNotMatch(body, /截止：/);
});

test("empty days are explicit and excessive header text fails instead of silently covering homework", () => {
  assert.match(planHomeworkImages({...snapshot, items: []}, measure)[0].rows[0].text, /没有该日期的作业/);
  assert.throws(() => planHomeworkImages({...snapshot, className: "班".repeat(2000)}, measure), /信息或提示过长/);
});

test("cooperative planning preserves synchronous layout, including pagination, markers and limits", async () => {
  for (const data of [snapshot, {...snapshot, items: []}, {...snapshot, cached: true, warning: "仍有待上传作业", items: [
    {...snapshot.items[0], content: "完整长作业👩‍🏫\n".repeat(180)}, {...snapshot.items[0], noHomework: true},
  ]}]) {
    assert.deepEqual(await planHomeworkImagesAsync(data, measure), planHomeworkImages(data, measure));
  }
  await assert.rejects(planHomeworkImagesAsync({...snapshot, items: [{...snapshot.items[0], content: "长正文\n".repeat(150)}]}, measure, {maxPages: 1}), /未被截断/);
});

test("a queued cancellation interrupts layout inside a single long paragraph", async t => {
  const controller = new AbortController();
  let measured = 0;
  // Deterministic simulated CPU time: force a yield without machine-speed assertions.
  t.mock.method(globalThis.performance, "now", () => measured);
  const pending = planHomeworkImagesAsync({...snapshot, items: [{...snapshot.items[0], content: "长".repeat(100000)}]}, () => { measured++; return 28; }, {signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, /已取消/);
  assert.ok(measured < 1000, "must stop before measuring the entire paragraph");
});

function mockCanvas(t, fontsReady = Promise.resolve(), encode = callback => callback(new Blob(["png"]))) {
  const canvas = {width: 0, height: 0, getContext: () => ({measureText: text => ({width: measure(text)}), fillText() {}, fillRect() {}}), toBlob: encode};
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {value: {fonts: {ready: fontsReady}, createElement: () => canvas}, configurable: true});
  t.after(() => { if (original) Object.defineProperty(globalThis, "document", original); else delete globalThis.document; });
  return canvas;
}

test("font loading is bounded and cancellation releases the canvas without waiting for fonts", async t => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const canvas = mockCanvas(t, new Promise(() => {}));
  const timed = assert.rejects(renderHomeworkImages(snapshot), /字体加载超时/);
  t.mock.timers.tick(3000);
  await timed;
  assert.equal(canvas.width, 0);
  const controller = new AbortController();
  const cancelled = assert.rejects(renderHomeworkImages(snapshot, {signal: controller.signal}), /已取消/);
  controller.abort();
  await cancelled;
  assert.equal(canvas.height, 0);
});

test("encoding timeout revokes earlier pages; a late callback cannot create more URLs", async t => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  let late, calls = 0, progressed;
  const progress = new Promise(resolve => { progressed = resolve; });
  const canvas = mockCanvas(t, Promise.resolve(), callback => {
    if (++calls === 1) callback(new Blob(["first page"]));
    else late = callback;
  });
  const created = t.mock.method(URL, "createObjectURL", () => "blob:first");
  const revoked = t.mock.method(URL, "revokeObjectURL", () => {});
  const controller = new AbortController();
  const pending = renderHomeworkImages({...snapshot, items: [{...snapshot.items[0], content: "多页作业\n".repeat(60)}]}, {
    signal: controller.signal, onProgress: progressed,
  });
  const rejected = assert.rejects(pending, /图片编码超时/);
  await progress;
  // Resume the between-page yield, then expire the held second encoding.
  t.mock.timers.tick(0);
  await Promise.resolve();
  assert.equal(typeof late, "function");
  t.mock.timers.tick(10000);
  await rejected;
  late(new Blob(["late page"]));
  await Promise.resolve();
  assert.equal(created.mock.callCount(), 1);
  assert.deepEqual(revoked.mock.calls.map(call => call.arguments), [["blob:first"]]);
  assert.equal(canvas.width, 0);
});
