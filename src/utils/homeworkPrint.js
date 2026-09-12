import {submissionOf} from "./homeworkInstructions.js";
import {isNoHomework} from "./noHomework.js";
import {preparationOf, preparationList, preparationToday} from "./homeworkPreparation.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function dateTime(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未记录" : new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

// Copy only fields needed on paper; never include credentials, diagnostics or offline inputs.
export function homeworkPrintSnapshot({publications, preparations = [], workspaceIds, boardDate, className, scopeLabel,
  generatedAt, cached = false, warning = "", now = new Date()}) {
  const targets = new Set(workspaceIds);
  const seen = new Set();
  const items = publications.filter(item => {
    if (!item.id || seen.has(item.id) || item.type !== "ASSIGNMENT" || item.status !== "PUBLISHED"
      || String(item.boardDate || "").slice(0, 10) !== boardDate
      || !item.targets?.some(target => targets.has(target.workspaceId))) return false;
    if (item.publishAt && new Date(item.publishAt).getTime() > now.getTime()) return false;
    seen.add(item.id);
    return true;
  }).map(item => ({
    subject: item.subject?.name || "未指定科目",
    targets: [...new Set(item.targets.filter(target => targets.has(target.workspaceId))
      .map(target => target.workspace?.name || "所选教学班"))].join("、"),
    title: item.title || "", content: item.content || "",
    noHomework: isNoHomework(item),
    preparation: preparationOf(item),
    submission: submissionOf(item),
    deadline: item.dueAt ? dateTime(item.dueAt) : "未设置",
    priority: ({URGENT: "紧急", IMPORTANT: "重要", NORMAL: "普通"})[item.priority] || "普通",
    certification: item.isCertified ? "教师已确认" : "待教师确认",
  })).sort((a, b) => a.subject.localeCompare(b.subject, "zh-CN"));
  return {className, scopeLabel, boardDate, items,
    preparations: preparationList(preparations, workspaceIds, [boardDate, preparationToday(now)].sort().at(-1), now), generatedAt: dateTime(generatedAt),
    createdAt: dateTime(now), cached, warning};
}

export function homeworkPrintDocument(snapshot) {
  const e = escapeHtml;
  const rows = snapshot.items.map((item, index) => `<section class="assignment">
    <h2><span class="checkbox" aria-hidden="true">□</span> ${index + 1}. ${e(item.subject)}${item.title ? ` · ${e(item.title)}` : ""}</h2>
    <p class="details">${e(item.targets)} · ${e(item.priority)} · ${e(item.certification)}</p>
    <p class="content">${e(item.content || "（正文为空，请参阅标题）")}</p>
    ${item.submission ? `<p class="content">提交说明：${e(item.submission)}</p>` : ""}
    ${item.preparation ? `<p class="content">${e(item.preparation.date)} 需带：${e(item.preparation.text)}</p>` : ""}
    <p class="deadline">截止：${e(item.deadline)}</p>
  </section>`).join("\n");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${e(snapshot.boardDate)} ${e(snapshot.className)} 作业清单</title>
<style>
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; color: #111; background: #fff; font: 11pt/1.65 "Microsoft YaHei", "PingFang SC", sans-serif; overflow-wrap: anywhere; }
main { max-width: 180mm; margin: auto; }
header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
h1 { font-size: 22pt; margin: 0 0 8px; }
h2 { font-size: 13pt; margin: 0 0 4px; break-after: avoid; }
p { margin: 4px 0; }
.details, .deadline, footer { font-size: 9pt; color: #444; }
.assignment .details { break-after: avoid; }
.content { white-space: pre-wrap; orphans: 3; widows: 3; }
.assignment { border-bottom: 1px solid #aaa; padding: 12px 0; break-inside: auto; }
.checkbox { font-family: sans-serif; }
.warning { border: 1px solid #555; padding: 8px; font-weight: bold; }
footer { border-top: 1px solid #111; margin-top: 20px; padding-top: 8px; }
@media print { body { padding: 0; } main { max-width: none; } }
</style></head><body><main>
<header><h1>作业清单</h1><p><strong>${e(snapshot.className)}</strong> · ${e(snapshot.boardDate)}</p>
<p>${e(snapshot.scopeLabel)}</p><p class="details">共 ${snapshot.items.length} 项 · 数据更新于 ${e(snapshot.generatedAt)}</p></header>
${snapshot.cached ? '<p class="warning">离线缓存内容，可能不是最新作业。请核对后使用。</p>' : ""}
${snapshot.warning ? `<p class="warning">${e(snapshot.warning)}</p>` : ""}
${snapshot.preparations?.length ? `<section class="assignment"><h2>需带物品</h2>${snapshot.preparations.map(item => `<p class="content">${e(item.date)} · ${e(item.subject)} · ${e(item.targets)} · ${item.certified ? "教师已确认" : "待教师确认"}<br>${e(item.text)}</p>`).join("")}</section>` : ""}
${rows || '<p>当前已加载内容中没有该日期的作业。</p>'}
<footer>NPClassworks · 生成于 ${e(snapshot.createdAt)}<br>按当前班级选择整理已加载作业；不含通知及本机尚未上传的作业。内容以生成时为准。</footer>
</main></body></html>`;
}
