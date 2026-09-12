export const HOMEWORK_IMAGE_WIDTH = 1200;
export const HOMEWORK_IMAGE_HEIGHT = 1600;
const MARGIN = 56;
const BOTTOM = HOMEWORK_IMAGE_HEIGHT - 90;
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
const styles = {
  title: {font: `bold 42px ${FONT}`, height: 60, color: "#12233a"},
  heading: {font: `bold 30px ${FONT}`, height: 46, color: "#12233a"},
  body: {font: `28px ${FONT}`, height: 42, color: "#172334"},
  meta: {font: `24px ${FONT}`, height: 36, color: "#43556b"},
  warning: {font: `bold 25px ${FONT}`, height: 38, color: "#9a3900"},
};

function finishSteps(steps) {
  let step;
  do { step = steps.next(); } while (!step.done);
  return step.value;
}

export function wrapHomeworkImageText(value, measure, width) {
  return finishSteps(wrapTextSteps(value, measure, width));
}

function* wrapTextSteps(value, measure, width) {
  const result = [];
  let processed = 0;
  const segmenter = new Intl.Segmenter("zh-CN", {granularity: "grapheme"});
  for (const paragraph of String(value ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    let line = "", lineWidth = 0;
    for (const {segment} of segmenter.segment(paragraph)) {
      if (++processed % 256 === 0) yield;
      const size = measure(segment);
      if (size > width) throw new Error("文字尺寸超出图片宽度，无法完整导出。");
      if (line && lineWidth + size > width) { result.push(line); line = ""; lineWidth = 0; }
      line += segment; lineWidth += size;
    }
    result.push(line);
    if (++processed % 256 === 0) yield;
  }
  return result;
}

// Plan every text line before rendering. Limits cause an explicit error, never truncation.
export function planHomeworkImages(snapshot, measure, maxPages = 100) {
  return finishSteps(planImageSteps(snapshot, measure, maxPages));
}

// The synchronous planner and browser renderer consume the same layout algorithm.
function* planImageSteps(snapshot, measure, maxPages) {
  function* rows(text, kind) {
    const lines = yield* wrapTextSteps(text, value => measure(value, styles[kind].font), HOMEWORK_IMAGE_WIDTH - 2 * MARGIN);
    return lines.map(text => ({text, kind, height: styles[kind].height}));
  }
  const headers = [
    ...yield* rows("作业清单", "title"), ...yield* rows(`${snapshot.className} · ${snapshot.boardDate}`, "heading"),
    ...yield* rows(snapshot.scopeLabel, "meta"), ...yield* rows(`数据更新于 ${snapshot.generatedAt}`, "meta"),
    ...yield* rows(`共 ${snapshot.items.filter(item => !item.noHomework).length} 项作业 · ${snapshot.items.filter(item => item.noHomework).length} 项无作业标记`, "meta"),
    ...(snapshot.cached ? yield* rows("离线缓存内容，可能不是最新作业，请核对。", "warning") : []),
    ...(snapshot.warning ? yield* rows(snapshot.warning, "warning") : []),
  ];
  const contentStart = MARGIN + headers.reduce((sum, row) => sum + row.height, 0) + 24;
  if (contentStart > BOTTOM - 200) throw new Error("班级信息或提示过长，无法完整排版，请缩小班级范围后重试。");
  const pages = [];
  let page, y;
  function nextPage(continuation) {
    if (pages.length >= maxPages) throw new Error("清单超过 100 张图片，请缩小班级范围后重试；内容未被截断。");
    page = {rows: [], headers, contentStart}; pages.push(page); y = contentStart;
    if (continuation) append(finishSteps(rows(continuation, "meta")));
  }
  function append(lines, continuation) {
    for (const row of lines) {
      if (y + row.height > BOTTOM) nextPage(continuation);
      page.rows.push({...row, y}); y += row.height;
    }
  }
  nextPage();
  for (const item of snapshot.preparations || []) {
    const continuation = "需带物品（续）";
    append(yield* rows(`需带物品 · ${item.date}`, "heading"), continuation);
    append(yield* rows(`${item.subject} · ${item.targets} · ${item.certified ? "教师已确认" : "待教师确认"}`, "meta"), continuation);
    append(yield* rows(item.text, "body"), continuation);
    y += 24;
  }
  for (const [index, item] of snapshot.items.entries()) {
    yield;
    const continuation = `第 ${index + 1} 项（续）`;
    if (y + 180 > BOTTOM && page.rows.length) nextPage();
    append(yield* rows(`${index + 1}. ${item.subject}${item.title ? " · " + item.title : ""}`, "heading"), continuation);
    append(yield* rows(`${item.targets} · ${item.certification} · ${item.priority}`, "meta"), continuation);
    if (!item.noHomework) append(yield* rows(`截止：${item.deadline}`, "meta"), continuation);
    append(yield* rows(item.content || "（正文为空，请参阅标题）", "body"), continuation);
    if (item.submission) append(yield* rows(`提交说明：${item.submission}`, "body"), continuation);
    if (item.preparation) append(yield* rows(`${item.preparation.date} 需带：${item.preparation.text}`, "body"), continuation);
    y += 24;
  }
  if (!snapshot.items.length) append(yield* rows("当前已加载内容中没有该日期的作业。", "body"));
  return pages;
}

function assertImageActive(signal) {
  if (signal?.aborted) throw new Error("图片生成已取消");
}

export async function planHomeworkImagesAsync(snapshot, measure, {signal, maxPages = 100} = {}) {
  const steps = planImageSteps(snapshot, measure, maxPages);
  let sliceStart = globalThis.performance.now();
  try {
    while (true) {
      assertImageActive(signal);
      const step = steps.next();
      if (step.done) return step.value;
      if (globalThis.performance.now() - sliceStart >= 8) {
        await new Promise(resolve => setTimeout(resolve, 0));
        sliceStart = globalThis.performance.now();
      }
    }
  } finally { steps.return(); }
}

function waitForImageWork(work, signal, timeoutMs, message) {
  assertImageActive(signal);
  return new Promise((resolve, reject) => {
    const complete = (callback, value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => complete(reject, new Error("图片生成已取消"));
    const timer = setTimeout(() => complete(reject, new Error(message)), timeoutMs);
    signal?.addEventListener("abort", abort, {once: true});
    Promise.resolve(work).then(value => complete(resolve, value), error => complete(reject, error));
  });
}

export async function renderHomeworkImages(snapshot, {signal, onProgress = () => {}} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = HOMEWORK_IMAGE_WIDTH; canvas.height = HOMEWORK_IMAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建图片画布，请更换浏览器后重试。");
  const urls = [];
  const assertActive = () => assertImageActive(signal);
  try {
    await waitForImageWork(document.fonts?.ready, signal, 3000, "字体加载超时，请稍后重新生成图片。");
    assertActive();
    const widths = new Map();
    const pages = await planHomeworkImagesAsync(snapshot, (text, font) => {
      const key = `${font}:${text}`;
      if (!widths.has(key)) { context.font = font; widths.set(key, context.measureText(text).width); }
      return widths.get(key);
    }, {signal});
    const draw = (row, y) => {
      const style = styles[row.kind]; context.font = style.font; context.fillStyle = style.color;
      context.fillText(row.text, MARGIN, y + 4);
    };
    for (const [index, page] of pages.entries()) {
      assertActive();
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.textBaseline = "top";
      let y = MARGIN;
      for (const row of page.headers) { draw(row, y); y += row.height; }
      context.fillStyle = "#24669a"; context.fillRect(MARGIN, page.contentStart - 12, canvas.width - MARGIN * 2, 2);
      page.rows.forEach(row => draw(row, row.y));
      draw({kind: "meta", text: `NPClassworks · 第 ${index + 1} / ${pages.length} 张 · 内容以生成时为准`}, BOTTOM + 20);
      const encoding = new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("图片编码失败，请重试。")), "image/png"));
      const blob = await waitForImageWork(encoding, signal, 10_000, "图片编码超时，请稍后重试。");
      assertActive();
      const className = Array.from(String(snapshot.className)).slice(0, 80)
        .map(char => char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? "_" : char).join("");
      urls.push({url: URL.createObjectURL(blob), filename: `${snapshot.boardDate}-${className}-作业清单-${index + 1}.png`});
      onProgress(index + 1, pages.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return urls;
  } catch (error) {
    urls.forEach(item => URL.revokeObjectURL(item.url));
    throw error;
  } finally { canvas.width = 0; canvas.height = 0; }
}
