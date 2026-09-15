// Use the same detached, scope-filtered snapshot as printing and image export.
export function homeworkTextSubjects(snapshot) {
  return [...new Set([...(snapshot?.items || []), ...(snapshot?.preparations || [])].map(item => item.subject))]
    .filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function homeworkTextDocument(snapshot, subjects = homeworkTextSubjects(snapshot)) {
  if (!snapshot) return "";
  const selected = new Set(subjects);
  const items = snapshot.items.filter(item => selected.has(item.subject));
  const preparations = (snapshot.preparations || []).filter(item => selected.has(item.subject));
  const lines = [snapshot.title || "作业清单", `${snapshot.className} · ${snapshot.boardDate}`,
    snapshot.scopeLabel, `所选科目：${subjects.join("、") || "未选择"}`,
    `数据更新于 ${snapshot.generatedAt}`, `共 ${items.length} 项记录`];
  if (snapshot.cached) lines.push("【注意】离线缓存内容，可能不是最新作业。请核对后使用。");
  if (snapshot.warning) lines.push(`【注意】${snapshot.warning}`);
  for (const [index, item] of items.entries()) {
    lines.push("", `${index + 1}. 【${item.subject}】${item.title || "作业"}`,
      [item.group, item.targets, item.priority, item.certification].filter(Boolean).join(" · "));
    if (item.noHomework) lines.push("今日无作业");
    else {
      lines.push(item.optionalContent ? item.content : `必做：\n${item.content || "（正文为空，请参阅标题）"}`);
      if (item.optionalContent) lines.push(`选做：\n${item.optionalContent}`);
      if (item.submission) lines.push(`提交说明：${item.submission}`);
      lines.push(`截止：${item.deadline}`);
    }
    if (item.preparation) lines.push(`${item.preparation.date} 需带：${item.preparation.text}`);
  }
  if (preparations.length) {
    lines.push("", "需带物品汇总");
    for (const item of preparations) lines.push(`${item.date} · ${item.subject} · ${item.targets} · ${item.certified ? "教师已确认" : "待教师确认"}`, item.text);
  }
  if (!items.length) lines.push("", subjects.length ? (snapshot.emptyMessage || "当前已加载内容中没有所选科目的作业记录，不代表无作业。") : "请先选择要分享的科目。");
  lines.push("", `NPClassworks · 生成于 ${snapshot.createdAt}`, "按所选科目整理已加载内容；不含通知及本机尚未上传的作业。内容以生成时为准。");
  return lines.filter(line => line !== undefined && line !== null).join("\n");
}
