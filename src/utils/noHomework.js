export const NO_HOMEWORK_TITLE = "今日无作业";
export const NO_HOMEWORK_CONTENT = "本日该科目无作业。";
export const NO_HOMEWORK_META = {kind: "NO_HOMEWORK", version: 1};

// Old clients may edit text without clearing metadata: never interpret that as no homework.
export function isNoHomework(item) {
  return item?.type === "ASSIGNMENT" && item.contentJson?.kind === "NO_HOMEWORK"
    && item.contentJson.version === 1 && item.title === NO_HOMEWORK_TITLE
    && item.content === NO_HOMEWORK_CONTENT && !item.dueAt;
}

export function hasNoHomeworkConflict(items, workspaceIds) {
  const allowed = new Set(workspaceIds);
  return items.some(marker => isNoHomework(marker) && items.some(item => !isNoHomework(item)
    && item.subjectId === marker.subjectId && String(item.boardDate).slice(0, 10) === String(marker.boardDate).slice(0, 10)
    && item.targets?.some(target => allowed.has(target.workspaceId)
      && marker.targets?.some(candidate => candidate.workspaceId === target.workspaceId))));
}

export function dailyHomeworkStatuses(publications, workspaces, subjects, date) {
  const names = new Map();
  for (const subject of [
    ...publications.map(item => ({id: item.subjectId, ...item.subject})),
    ...workspaces.flatMap(workspace => [workspace.subject, ...(workspace.subjectRules || []).map(rule => rule.subject)]),
    ...subjects,
  ]) {
    if (subject?.id && subject.name?.trim()) names.set(subject.id, subject.name);
  }
  return workspaces.flatMap(workspace => {
    const ids = workspace.type === "COURSE_GROUP" ? [workspace.subjectId] : (workspace.subjectRules || [])
      .filter(rule => rule.deliveryMode === "ADMIN_CLASS").map(rule => rule.subjectId);
    return [...new Set(ids.filter(Boolean))].map(subjectId => {
      const items = publications.filter(item => item.type === "ASSIGNMENT" && item.status === "PUBLISHED"
        && item.subjectId === subjectId && String(item.boardDate || "").slice(0, 10) === date
        && item.targets?.some(target => target.workspaceId === workspace.id));
      const work = items.filter(item => !isNoHomework(item));
      const markers = items.filter(isNoHomework);
      return {key: `${workspace.id}:${subjectId}`, subject: names.get(subjectId) || "科目名称暂不可用", workspace: workspace.name,
        state: work.length ? (markers.length ? "conflict" : "assigned") : markers.length ? "none" : "unknown",
        count: work.length, confirmed: markers.some(item => item.isCertified)};
    });
  });
}
