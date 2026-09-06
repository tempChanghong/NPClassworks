import {shiftBoardDate, sanitizeBoardDate} from "./boardDate.js";
import {isNoHomework} from "./noHomework.js";

export function homeworkWeekStart(date) {
  const day = sanitizeBoardDate(date);
  const weekday = new Date(`${day}T12:00:00`).getDay();
  return shiftBoardDate(day, -((weekday + 6) % 7));
}

export function deadlineBoardDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"})
    .formatToParts(date);
  const part = type => parts.find(item => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function groupHomeworkWeek(items, start, view, subjectId = "") {
  return Array.from({length: 7}, (_, index) => {
    const date = shiftBoardDate(start, index);
    const selected = items.filter(item => item.type === "ASSIGNMENT" && item.status === "PUBLISHED"
      && (!subjectId || item.subjectId === subjectId)
      && (view === "due" ? !isNoHomework(item) && deadlineBoardDate(item.dueAt) === date
        : String(item.boardDate || "").slice(0, 10) === date));
    return {date, items: selected, count: selected.filter(item => !isNoHomework(item)).length,
      subjects: new Set(selected.filter(item => !isNoHomework(item)).map(item => item.subjectId)).size};
  });
}

export async function loadHomeworkWeek(loadPage, {weekStart, weekView}, signal) {
  const items = new Map();
  let skip = 0;
  for (let page = 0; page < 100; page++) {
    if (signal?.aborted) throw new Error("查询已取消");
    const result = await loadPage({weekStart, weekView, limit: 100, skip});
    if (signal?.aborted) throw new Error("查询已取消");
    if (result.weekStart !== weekStart || result.weekView !== weekView) {
      throw new Error("后端尚不支持一周总览，请先升级后端后重试。");
    }
    if (!Array.isArray(result.items) || !Number.isFinite(result.total)) throw new Error("一周总览返回的数据不完整，请重试。");
    result.items.forEach(item => items.set(item.id, item));
    skip += result.items.length;
    if (skip >= result.total) return [...items.values()];
    if (!result.items.length) throw new Error("查询期间数据发生变化，请刷新一周总览。");
  }
  throw new Error("本周数据过多，请缩小班级选择范围后重试。");
}
