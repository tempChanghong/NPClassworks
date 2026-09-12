import {isNoHomework} from "./noHomework.js";

export const HOMEWORK_CHANGE_DURATION = 120_000;
const fields = {title: "标题", content: "正文", dueAt: "截止时间", subject: "科目", targets: "班级", noHomework: "作业状态", materials: "需带物品", materialsDate: "携带日期"};

export function homeworkChangeSnapshot(items, date, workspaceIds) {
  const allowed = new Set(workspaceIds);
  return items.filter(item => item.type === "ASSIGNMENT" && item.status === "PUBLISHED"
    && String(item.boardDate).slice(0, 10) === date && item.targets?.some(target => allowed.has(target.workspaceId)))
    .map(item => ({id: item.id, revision: item.revision, title: item.title || "", content: item.content || "",
      dueAt: item.dueAt || "", subject: item.subject?.name || "未指定科目", isCertified: Boolean(item.isCertified),
      materials: item.contentJson?.preparation?.text || "", materialsDate: item.contentJson?.preparation?.date || "",
      targets: item.targets.filter(target => allowed.has(target.workspaceId)).map(target => target.workspace?.name || target.workspaceId).sort().join("、"),
      noHomework: isNoHomework(item) ? "今日无作业" : "有作业"}));
}

export function homeworkChangedFields(before, after) {
  return Object.entries(fields).filter(([key]) => !before || before[key] !== after[key])
    .map(([key, label]) => ({key, label, before: before?.[key] ?? "", after: after[key]}));
}

// Bounded, in-memory state for one screen/date/scope. Never persist student-visible history.
export function createHomeworkChangeTracker() {
  let baseline = null;
  const pending = new Map();
  return {
    reset() { baseline = null; pending.clear(); },
    current(now = Date.now()) {
      for (const [id, item] of pending) if (item.expiresAt <= now) pending.delete(id);
      return [...pending.values()].reverse();
    },
    dismiss() { pending.clear(); },
    update(items, {cached = false, now = Date.now()} = {}) {
      this.current(now);
      if (!baseline) { baseline = new Map(items.map(item => [item.id, item])); return []; }
      if (cached) return this.current(now);
      for (const item of items) {
        const previous = baseline.get(item.id);
        if (previous && item.revision < previous.revision) continue;
        // First appearance is new homework, not a correction to previously displayed text.
        if (previous && homeworkChangedFields(previous, item).length) {
          const before = pending.has(item.id) ? pending.get(item.id).before : previous;
          const changes = homeworkChangedFields(before, item);
          if (changes.length) pending.set(item.id, {id: item.id, before, after: item, changes, expiresAt: now + HOMEWORK_CHANGE_DURATION});
          else pending.delete(item.id);
        } else if (pending.has(item.id)) {
          // Certification-only updates change the label, never restart the highlight timer.
          pending.get(item.id).after = item;
        }
        baseline.delete(item.id);
        baseline.set(item.id, item);
      }
      const visible = new Set(items.map(item => item.id));
      for (const id of pending.keys()) if (!visible.has(id)) pending.delete(id);
      while (baseline.size > 500) baseline.delete(baseline.keys().next().value);
      return this.current(now);
    },
  };
}

export function homeworkChangeExcerpt(before, after, max = 100) {
  const oldChars = Array.from(String(before)), newChars = Array.from(String(after));
  let common = 0;
  while (common < oldChars.length && common < newChars.length && oldChars[common] === newChars[common]) common++;
  const start = Math.max(0, common - 12);
  const excerpt = chars => (start ? "…" : "") + chars.slice(start, start + max).join("") + (chars.length > start + max ? "…" : "");
  return {before: excerpt(oldChars), after: excerpt(newChars)};
}
