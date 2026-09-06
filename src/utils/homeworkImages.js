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

export function wrapHomeworkImageText(value, measure, width) {
  const result = [];
  const segmenter = new Intl.Segmenter("zh-CN", {granularity: "grapheme"});
  for (const paragraph of String(value ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    let line = "", lineWidth = 0;
    for (const {segment} of segmenter.segment(paragraph)) {
      const size = measure(segment);
      if (size > width) throw new Error("文字尺寸超出图片宽度，无法完整导出。");
      if (line && lineWidth + size > width) { result.push(line); line = ""; lineWidth = 0; }
      line += segment; lineWidth += size;
    }
    result.push(line);
  }
  return result;
}

// Plan every text line before rendering. Limits cause an explicit error, never truncation.
export function planHomeworkImages(snapshot, measure, maxPages = 100) {
  const rows = (text, kind) => wrapHomeworkImageText(text, value => measure(value, styles[kind].font), HOMEWORK_IMAGE_WIDTH - 2 * MARGIN)
    .map(text => ({text, kind, height: styles[kind].height}));
  const headers = [
    ...rows("作业清单", "title"), ...rows(`${snapshot.className} · ${snapshot.boardDate}`, "heading"),
    ...rows(snapshot.scopeLabel, "meta"), ...rows(`数据更新于 ${snapshot.generatedAt}`, "meta"),
    ...rows(`共 ${snapshot.items.filter(item => !item.noHomework).length} 项作业 · ${snapshot.items.filter(item => item.noHomework).length} 项无作业标记`, "meta"),
    ...(snapshot.cached ? rows("离线缓存内容，可能不是最新作业，请核对。", "warning") : []),
    ...(snapshot.warning ? rows(snapshot.warning, "warning") : []),
  ];
  const contentStart = MARGIN + headers.reduce((sum, row) => sum + row.height, 0) + 24;
  if (contentStart > BOTTOM - 200) throw new Error("班级信息或提示过长，无法完整排版，请缩小班级范围后重试。");
  const pages = [];
  let page, y;
  function nextPage(continuation) {
    if (pages.length >= maxPages) throw new Error("清单超过 100 张图片，请缩小班级范围后重试；内容未被截断。");
    page = {rows: [], headers, contentStart}; pages.push(page); y = contentStart;
    if (continuation) append(rows(continuation, "meta"));
  }
  function append(lines, continuation) {
    for (const row of lines) {
      if (y + row.height > BOTTOM) nextPage(continuation);
      page.rows.push({...row, y}); y += row.height;
    }
  }
  nextPage();
  snapshot.items.forEach((item, index) => {
    const continuation = `第 ${index + 1} 项（续）`;
    if (y + 180 > BOTTOM && page.rows.length) nextPage();
    append(rows(`${index + 1}. ${item.subject}${item.title ? " · " + item.title : ""}`, "heading"), continuation);
    append(rows(`${item.targets} · ${item.certification} · ${item.priority}`, "meta"), continuation);
    if (!item.noHomework) append(rows(`截止：${item.deadline}`, "meta"), continuation);
    append(rows(item.content || "（正文为空，请参阅标题）", "body"), continuation);
    y += 24;
  });
  if (!snapshot.items.length) append(rows("当前已加载内容中没有该日期的作业。", "body"));
  return pages;
}

export async function renderHomeworkImages(snapshot, {signal, onProgress = () => {}} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = HOMEWORK_IMAGE_WIDTH; canvas.height = HOMEWORK_IMAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建图片画布，请更换浏览器后重试。");
  const urls = [];
  const assertActive = () => { if (signal?.aborted) throw new Error("图片生成已取消"); };
  try {
    await document.fonts?.ready;
    assertActive();
    const widths = new Map();
    const pages = planHomeworkImages(snapshot, (text, font) => {
      const key = `${font}:${text}`;
      if (!widths.has(key)) { context.font = font; widths.set(key, context.measureText(text).width); }
      return widths.get(key);
    });
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
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("图片编码失败，请重试。")), "image/png"));
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
