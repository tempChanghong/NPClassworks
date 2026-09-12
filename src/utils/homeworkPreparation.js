const dateFormatter = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Shanghai"});
export const preparationToday = (now = new Date()) => dateFormatter.format(now);
export function preparationOf(publication) {
  const value = publication?.contentJson?.preparation;
  if (publication?.type !== "ASSIGNMENT" || !value || typeof value.text !== "string" || !value.text.trim() || !validPreparationDate(value.date)) return null;
  return {text: value.text.trim(), date: value.date};
}

export function validPreparationDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "2000-01-01"
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function withPreparation(metadata, text, date) {
  const result = {...metadata};
  delete result.preparation;
  if (text?.trim()) {
    if (text.length > 500) throw new Error("需带物品不能超过500字。");
    if (!validPreparationDate(date)) throw new Error("请为需带物品选择有效的携带日期。");
    result.preparation = {text: text.trim(), date};
  }
  return Object.keys(result).length ? result : null;
}

export function splitPreparationFeed(result, boardDate) {
  const preparations = (result.items || []).filter(item => preparationOf(item));
  return {...result, preparations,
    items: result.includesPreparations ? result.items.filter(item => item.type !== "ASSIGNMENT" || String(item.boardDate).slice(0, 10) === boardDate) : result.items};
}

export function preparationList(publications, workspaceIds, fromDate, now = new Date()) {
  const allowed = new Set(workspaceIds), seen = new Set();
  return (publications || []).flatMap(item => {
    const preparation = preparationOf(item);
    const targets = item.targets?.filter(target => allowed.has(target.workspaceId)) || [];
    if (!preparation || preparation.date < fromDate || item.status !== "PUBLISHED" || !targets.length || seen.has(item.id)
      || (item.publishAt && Date.parse(item.publishAt) > now.getTime())) return [];
    seen.add(item.id);
    return [{id: item.id, ...preparation, subject: item.subject?.name || "未指定科目", certified: Boolean(item.isCertified),
      targets: [...new Set(targets.map(target => target.workspace?.name || "所选教学班"))].join("、")}];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject, "zh-CN") || a.id.localeCompare(b.id));
}
