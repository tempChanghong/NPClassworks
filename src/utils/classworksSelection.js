export function sanitizeCourseGroupIds(courseOptions, candidate = {}) {
  const sanitized = {};
  for (const item of courseOptions?.subjects || []) {
    if (!item?.requiresCourseGroupSelection || !item.subject?.id) continue;
    const selectedId = candidate?.[item.subject.id];
    if (!selectedId) continue;
    const isAvailable = (item.courseGroups || []).some((group) => group.id === selectedId);
    if (isAvailable) sanitized[item.subject.id] = selectedId;
  }
  return sanitized;
}

export function publicationTransitionDelay(nextTransitionAt, now = Date.now()) {
  if (!nextTransitionAt) return null;
  const timestamp = new Date(nextTransitionAt).getTime();
  if (Number.isNaN(timestamp)) return null;
  // 留出少量余量，避免客户端与数据库时钟边界造成提前请求。
  return Math.min(Math.max(timestamp - now + 250, 250), 2_147_483_647);
}
