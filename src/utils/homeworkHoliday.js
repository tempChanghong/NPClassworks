import {validPreparationDate} from "./homeworkPreparation.js";
import {shiftBoardDate} from "./boardDate.js";
import {loadHomeworkWeek, deadlineBoardDate} from "./homeworkWeek.js";
import {homeworkPrintSnapshot} from "./homeworkPrint.js";

export function validateHolidayRange(start, end, searchStart) {
  if (![start, end, searchStart].every(validPreparationDate) || searchStart > start || start > end
    || (Date.parse(end) - Date.parse(searchStart)) / 86400000 > 92) {
    throw new Error("请填写有效日期：查找起日不能晚于假期开始，整个查找范围最多93天。");
  }
}

export async function loadHolidayHomework(loadPage, {start, end, searchStart}, signal) {
  validateHolidayRange(start, end, searchStart);
  const items = new Map();
  // Due-date queries also find assignments set earlier than the board-date search window.
  for (const [first, view] of [[searchStart, "board"], [start, "due"]]) {
    for (let date = first; date <= end; date = shiftBoardDate(date, 7)) {
      const page = await loadHomeworkWeek(loadPage, {weekStart: date, weekView: view}, signal);
      for (const item of page) {
        const day = view === "board" ? String(item.boardDate).slice(0, 10) : deadlineBoardDate(item.dueAt);
        if (day >= first && day <= end) items.set(item.id, item);
      }
    }
  }
  return [...items.values()].filter(item => item.type === "ASSIGNMENT" && item.status === "PUBLISHED")
    .sort((a, b) => (a.subject?.name || "").localeCompare(b.subject?.name || "", "zh-CN") || String(a.boardDate).localeCompare(String(b.boardDate)));
}

export function holidayDefaultSelection(items, start, end) {
  return items.filter(item => [String(item.boardDate).slice(0, 10), deadlineBoardDate(item.dueAt)]
    .some(date => date >= start && date <= end)).map(item => item.id);
}

export function holidayPrintSnapshot({items, selectedIds, start, end, title, ...options}) {
  const selected = new Set(selectedIds), seen = new Set();
  const publications = items.filter(item => selected.has(item.id) && !seen.has(item.id) && seen.add(item.id));
  const result = homeworkPrintSnapshot({...options, boardDate: start, publications: []});
  result.items = publications.flatMap(item => homeworkPrintSnapshot({...options,
    boardDate: String(item.boardDate).slice(0, 10), publications: [item]}).items.map(row => ({...row,
    title: `${row.title ? row.title + ' · ' : ''}作业日期 ${String(item.boardDate).slice(0, 10)}`})));
  return {...result, title: title.trim() || "放假作业汇总", boardDate: `${start} 至 ${end}`,
    scopeLabel: `${options.scopeLabel || ''} · 人工核对选入 ${result.items.length} 项`, preparations: []};
}
