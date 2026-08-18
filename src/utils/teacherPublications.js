const STATE_ORDER = Object.freeze({pending: 0, draft: 1, published: 2, withdrawn: 3});

export function teacherPublicationState(publication) {
  if (publication.status === "WITHDRAWN") {
    return {key: "withdrawn", label: "已撤回", color: "grey", icon: "mdi-undo-variant"};
  }
  if (publication.status === "DRAFT") {
    return {key: "draft", label: "草稿", color: "warning", icon: "mdi-file-edit-outline"};
  }
  if (!publication.isCertified) {
    return {key: "pending", label: "待教师确认", color: "warning", icon: "mdi-alert-circle-outline"};
  }
  return {key: "published", label: "已发布", color: "success", icon: "mdi-check-decagram-outline"};
}

export function teacherPublicationStats(publications = []) {
  const stats = {all: publications.length, pending: 0, draft: 0, published: 0, withdrawn: 0};
  for (const publication of publications) stats[teacherPublicationState(publication).key] += 1;
  return stats;
}

export function teacherPublicationFilterOptions(publications = []) {
  const subjects = new Map();
  const workspaces = new Map();
  for (const publication of publications) {
    if (publication.subject?.id) {
      subjects.set(publication.subject.id, {title: publication.subject.name, value: publication.subject.id});
    }
    for (const target of publication.targets || []) {
      if (target.workspace?.id) {
        workspaces.set(target.workspace.id, {
          title: target.workspace.name,
          value: target.workspace.id,
          type: target.workspace.type,
        });
      }
    }
  }
  const byTitle = (left, right) => left.title.localeCompare(right.title, "zh-CN", {numeric: true});
  return {
    subjects: [...subjects.values()].sort(byTitle),
    workspaces: [...workspaces.values()].sort((left, right) => {
      if (left.type !== right.type) return left.type === "ADMIN_CLASS" ? -1 : 1;
      return byTitle(left, right);
    }),
  };
}

function searchableText(publication) {
  return [
    publication.title,
    publication.content,
    publication.subject?.name,
    publication.author?.name,
    ...(publication.targets || []).map((target) => target.workspace?.name),
  ].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
}

export function filterTeacherPublications(publications = [], filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("zh-CN");
  return publications
    .filter((publication) => !filters.state || teacherPublicationState(publication).key === filters.state)
    .filter((publication) => !filters.type || publication.type === filters.type)
    .filter((publication) => !filters.subjectId || publication.subjectId === filters.subjectId)
    .filter((publication) => !filters.workspaceId || publication.targets?.some(
      (target) => target.workspaceId === filters.workspaceId,
    ))
    .filter((publication) => !filters.boardDate || (
      publication.type === "ASSIGNMENT" && String(publication.boardDate || "").slice(0, 10) === filters.boardDate
    ))
    .filter((publication) => !query || searchableText(publication).includes(query))
    .sort((left, right) => {
      const stateDifference = STATE_ORDER[teacherPublicationState(left).key]
        - STATE_ORDER[teacherPublicationState(right).key];
      if (stateDifference) return stateDifference;
      return new Date(right.updatedAt || right.publishAt || 0).getTime()
        - new Date(left.updatedAt || left.publishAt || 0).getTime();
    });
}
