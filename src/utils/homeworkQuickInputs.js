export const DEFAULT_HOMEWORK_QUICK_INPUTS = Object.freeze([
  {label: "完成", text: "完成", group: "动作", subjectIds: [], insertMode: "INLINE"},
  {label: "预习", text: "预习", group: "动作", subjectIds: [], insertMode: "INLINE"},
  {label: "复习", text: "复习", group: "动作", subjectIds: [], insertMode: "INLINE"},
  {label: "背诵", text: "背诵", group: "动作", subjectIds: [], insertMode: "INLINE"},
  {label: "订正", text: "订正", group: "动作", subjectIds: [], insertMode: "INLINE"},
  {label: "课本", text: "课本", group: "材料", subjectIds: [], insertMode: "INLINE"},
  {label: "练习册", text: "练习册", group: "材料", subjectIds: [], insertMode: "INLINE"},
  {label: "第", text: "第", group: "范围", subjectIds: [], insertMode: "INLINE"},
  {label: "至", text: "至", group: "范围", subjectIds: [], insertMode: "INLINE"},
  {label: "页", text: "页", group: "范围", subjectIds: [], insertMode: "INLINE"},
  {label: "题", text: "题", group: "范围", subjectIds: [], insertMode: "INLINE"},
  {label: "换行", text: "", group: "排版", subjectIds: [], insertMode: "NEW_LINE"},
]);

export function sanitizeHomeworkQuickInputs(value) {
  if (!Array.isArray(value)) return DEFAULT_HOMEWORK_QUICK_INPUTS.map(cloneQuickInput);
  return value.slice(0, 64).map((item) => ({
    label: String(item?.label || "").trim().slice(0, 16),
    text: String(item?.text || "").trim().slice(0, 120),
    group: String(item?.group || "").trim().slice(0, 16),
    subjectIds: [...new Set(Array.isArray(item?.subjectIds) ? item.subjectIds.filter(Boolean) : [])],
    insertMode: item?.insertMode === "NEW_LINE" ? "NEW_LINE" : "INLINE",
  })).filter((item) => item.label && (item.text || item.insertMode === "NEW_LINE"));
}

export function filterHomeworkQuickInputs(items, subjectId) {
  return sanitizeHomeworkQuickInputs(items).filter((item) => (
    item.subjectIds.length === 0 || (subjectId && item.subjectIds.includes(subjectId))
  ));
}

export function insertHomeworkQuickInput(content, start, end, item) {
  const source = String(content || "");
  const from = Math.max(0, Math.min(Number.isInteger(start) ? start : source.length, source.length));
  const to = Math.max(from, Math.min(Number.isInteger(end) ? end : from, source.length));
  let inserted = item?.insertMode === "NEW_LINE" ? "\n" : String(item?.text || "");
  if (item?.insertMode === "NEW_LINE") {
    if (source.slice(from - 1, from) === "\n" || source.slice(to, to + 1) === "\n") inserted = "";
  }
  const value = `${source.slice(0, from)}${inserted}${source.slice(to)}`;
  return {value, cursor: from + inserted.length};
}

function cloneQuickInput(item) {
  return {...item, subjectIds: [...item.subjectIds]};
}
