const PRIORITY_RANK = {URGENT: 0, IMPORTANT: 1, NORMAL: 2};

export function screenNotificationCenterItems(publications, acknowledgedKeys = new Set()) {
  return (publications || [])
    .filter((publication) => publication?.type === "NOTICE")
    .map((publication) => ({
      ...publication,
      acknowledged: acknowledgedKeys.has(`${publication.id}:${publication.revision}`),
    }))
    .sort((left, right) =>
      Number(left.acknowledged) - Number(right.acknowledged) ||
      (PRIORITY_RANK[left.priority] ?? 3) - (PRIORITY_RANK[right.priority] ?? 3) ||
      new Date(right.publishAt || 0).getTime() - new Date(left.publishAt || 0).getTime());
}

export function screenNotificationCenterSummary(items) {
  return {
    total: items.length,
    pending: items.filter((item) => !item.acknowledged).length,
    urgent: items.filter((item) => item.priority === "URGENT").length,
  };
}
