function normalizeComparable(value) {
  if (Array.isArray(value)) return [...value].map(String).sort();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  }
  if (value === undefined || value === null || value === "") return "（空）";
  if (typeof value === "boolean") return value ? "是" : "否";
  return value;
}

export function buildConflictComparison(local, current, fields = []) {
  return fields.map((field) => {
    const localValue = normalizeComparable(field.local ? field.local(local) : local?.[field.key]);
    const currentValue = normalizeComparable(field.current ? field.current(current) : current?.[field.key]);
    const format = field.format || ((value) => {
      if (Array.isArray(value)) return value.join("、");
      if (value && typeof value === "object") return JSON.stringify(value);
      return String(value);
    });
    return {
      key: field.key,
      label: field.label,
      localValue: format(localValue),
      currentValue: format(currentValue),
      changed: JSON.stringify(localValue) !== JSON.stringify(currentValue),
    };
  }).filter((item) => item.changed);
}

export const PUBLICATION_CONFLICT_FIELDS = Object.freeze([
  {key: "title", label: "标题"},
  {key: "content", label: "正文"},
  {key: "subjectId", label: "科目"},
  {key: "targetWorkspaceIds", label: "发布目标", current: (value) =>
    value?.targetWorkspaceIds || value?.targets?.map((item) => item.workspaceId)},
  {key: "boardDate", label: "作业板日期", current: (value) => String(value?.boardDate || "").slice(0, 10)},
  {key: "publishAt", label: "发布时间"},
  {key: "dueAt", label: "截止时间"},
  {key: "expiresAt", label: "失效时间"},
  {key: "priority", label: "优先级"},
  {key: "status", label: "发布状态"},
]);
