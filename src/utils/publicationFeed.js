const PRIORITY_WEIGHT = Object.freeze({URGENT: 3, IMPORTANT: 2, NORMAL: 1});

function timestamp(value, fallback = Number.POSITIVE_INFINITY) {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? fallback : parsed;
}

function priorityWeight(publication) {
  return PRIORITY_WEIGHT[publication?.priority] || 0;
}

function smartCompare(left, right) {
  const priorityDifference = priorityWeight(right) - priorityWeight(left);
  if (priorityDifference) return priorityDifference;
  const dueDifference = timestamp(left.dueAt) - timestamp(right.dueAt);
  if (dueDifference) return dueDifference;
  return timestamp(right.publishAt, 0) - timestamp(left.publishAt, 0);
}

function dueCompare(left, right) {
  const dueDifference = timestamp(left.dueAt) - timestamp(right.dueAt);
  return dueDifference || smartCompare(left, right);
}

function recentCompare(left, right) {
  return timestamp(right.publishAt, 0) - timestamp(left.publishAt, 0) || smartCompare(left, right);
}

function publicationComparator(sortMode) {
  if (sortMode === "due") return dueCompare;
  if (sortMode === "recent") return recentCompare;
  return smartCompare;
}

function targetsWorkspace(publication, workspaceId) {
  return !workspaceId || publication.targets?.some((target) => target.workspaceId === workspaceId);
}

export function publicationFilterOptions(publications = []) {
  const subjects = new Map();
  const workspaces = new Map();
  for (const publication of publications) {
    if (publication.type === "ASSIGNMENT" && publication.subject?.id) {
      subjects.set(publication.subject.id, {
        title: publication.subject.name,
        value: publication.subject.id,
      });
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

export function organizePublicationFeed(publications = [], filters = {}) {
  const {
    subjectId = "",
    workspaceId = "",
    sortMode = "smart",
    excludeUrgentNotices = false,
  } = filters;
  const compare = publicationComparator(sortMode);
  const notices = publications
    .filter((publication) => publication.type === "NOTICE")
    .filter((publication) => !excludeUrgentNotices || publication.priority !== "URGENT")
    .filter((publication) => targetsWorkspace(publication, workspaceId))
    .sort(smartCompare);
  const assignments = publications
    .filter((publication) => publication.type === "ASSIGNMENT")
    .filter((publication) => !subjectId || publication.subjectId === subjectId)
    .filter((publication) => targetsWorkspace(publication, workspaceId));

  const groupsBySubject = new Map();
  for (const publication of assignments) {
    const key = publication.subjectId || "unknown";
    if (!groupsBySubject.has(key)) {
      groupsBySubject.set(key, {
        id: key,
        name: publication.subject?.name || "未分类科目",
        publications: [],
      });
    }
    groupsBySubject.get(key).publications.push(publication);
  }
  const assignmentGroups = [...groupsBySubject.values()];
  for (const group of assignmentGroups) group.publications.sort(compare);
  assignmentGroups.sort((left, right) => (
    compare(left.publications[0], right.publications[0]) ||
    left.name.localeCompare(right.name, "zh-CN", {numeric: true})
  ));

  return {
    notices,
    assignmentGroups,
    visibleCount: notices.length + assignments.length,
  };
}

export function assignmentDueState(dueAt, now = new Date()) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const difference = due.getTime() - now.getTime();
  if (difference < 0) return {key: "overdue", label: "已截止", color: "error", icon: "mdi-calendar-remove"};
  const sameLocalDate = due.getFullYear() === now.getFullYear()
    && due.getMonth() === now.getMonth()
    && due.getDate() === now.getDate();
  if (sameLocalDate) return {key: "today", label: "今日截止", color: "warning", icon: "mdi-calendar-today"};
  if (difference <= 24 * 60 * 60 * 1000) {
    return {key: "soon", label: "即将截止", color: "warning", icon: "mdi-calendar-alert"};
  }
  return {key: "future", label: "截止", color: "primary", icon: "mdi-calendar-clock"};
}
