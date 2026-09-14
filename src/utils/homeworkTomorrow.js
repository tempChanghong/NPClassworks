import {shiftBoardDate} from "./boardDate.js";
import {preparationToday, preparationList} from "./homeworkPreparation.js";
import {deadlineBoardDate, loadHomeworkWeek} from "./homeworkWeek.js";
import {isNoHomework} from "./noHomework.js";
import {homeworkPrintSnapshot} from "./homeworkPrint.js";

export const TOMORROW_SCOPE_NOTE = "未设置截止时间的作业无法归入明日要交；下方仅核对今天作业板上的此类作业，更早的无截止日期作业请查阅历史。";
export const tomorrowDeadline = value => new Date(value).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai", hour12: false});

function visibleAssignments(items, workspaceIds, now) {
  const ids = new Set(workspaceIds), seen = new Set();
  return items.filter(item => item.id && !seen.has(item.id) && item.type === "ASSIGNMENT" && item.status === "PUBLISHED"
    && !isNoHomework(item) && item.targets?.some(target => ids.has(target.workspaceId))
    && (!item.publishAt || Date.parse(item.publishAt) <= now.getTime()) && seen.add(item.id));
}

// Read the complete due-date query independently from today's board, so older work is included.
export async function loadTomorrowHomework({loadDay, loadWeek, workspaceIds, now = new Date(), getNow = () => new Date()}, signal) {
  const today = preparationToday(now), tomorrow = shiftBoardDate(today, 1);
  const revisions = new Map();
  function checkRevisions(items) {
    for (const item of items) {
      if (revisions.has(item.id) && revisions.get(item.id) !== item.revision) {
        throw new Error("读取期间作业版本发生变化，请刷新核对清单。");
      }
      revisions.set(item.id, item.revision);
    }
  }
  const [day, week] = await Promise.all([
    loadDay(today).then(result => {
      if (Array.isArray(result?.items) && Array.isArray(result?.preparations)) checkRevisions([...result.items, ...result.preparations]);
      return result;
    }),
    loadHomeworkWeek(async params => {
      const result = await loadWeek(params);
      // Check each raw page before the weekly loader deduplicates by ID.
      if (Array.isArray(result?.items)) checkRevisions(result.items);
      return result;
    }, {weekStart: tomorrow, weekView: "due"}, signal),
  ]);
  if (signal?.aborted) throw new Error("查询已取消");
  if (day.boardDate !== today || day.includesPreparations !== true || !Array.isArray(day.items) || !Array.isArray(day.preparations)) {
    throw new Error("清单数据不完整，请确认服务已更新后重试。");
  }
  // Visibility is evaluated after all responses arrive, not before a slow request starts.
  const visibleAt = getNow();
  const due = visibleAssignments(week, workspaceIds, visibleAt).filter(item => deadlineBoardDate(item.dueAt) === tomorrow)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || (a.subject?.name || "").localeCompare(b.subject?.name || "", "zh-CN"));
  const unknown = visibleAssignments(day.items, workspaceIds, visibleAt)
    .filter(item => String(item.boardDate).slice(0, 10) === today && !deadlineBoardDate(item.dueAt));
  const preparations = preparationList(visibleAssignments(day.preparations, workspaceIds, visibleAt), workspaceIds, tomorrow, visibleAt)
    .filter(item => item.date === tomorrow);
  return {today, tomorrow, due, unknown, preparations};
}

export function tomorrowPrintSnapshot({checklist, workspaceIds, className, generatedAt, warning = "", now = new Date()}) {
  const result = homeworkPrintSnapshot({publications: [], workspaceIds, className, boardDate: checklist.tomorrow, generatedAt, now});
  result.items = [["明日要交", checklist.due], ["今日作业 · 截止未设置，请核对", checklist.unknown]].flatMap(([group, publications]) =>
    publications.flatMap(item => homeworkPrintSnapshot({publications: [item], workspaceIds, boardDate: String(item.boardDate).slice(0, 10), now}).items
      .map(row => ({...row, group, deadline: item.dueAt ? tomorrowDeadline(item.dueAt) : "未设置，不能确定是否明天要交",
        title: `${row.title ? row.title + ' · ' : ''}作业日期 ${String(item.boardDate).slice(0, 10)}`,
        // Tomorrow's packing list is shown separately; unrelated dates do not belong here.
        preparation: null}))));
  return {...result, title: "放学前核对清单", preparations: checklist.preparations,
    scopeLabel: `北京时间 · 明日要交 ${checklist.due.length} 项 · 明日需带 ${checklist.preparations.length} 项 · 今日截止未设置 ${checklist.unknown.length} 项`,
    warning: [TOMORROW_SCOPE_NOTE, warning].filter(Boolean).join("\n"),
    emptyMessage: "当前已发布内容中，未查到明天截止的作业及今日未设置截止时间的作业。"};
}
