// Older deployed APIs return the whole array even when query parameters are sent.
// Keep the new UI usable during a staggered frontend/backend rollout.
export function publicationHistoryPage(result, {limit = 20, beforeRevision} = {}) {
  if (!Array.isArray(result)) return result;
  const rows = result.filter(item => beforeRevision === undefined || item.revision < beforeRevision)
    .sort((a, b) => b.revision - a.revision);
  const items = rows.slice(0, limit);
  return {items, nextBeforeRevision: rows.length > limit ? items.at(-1).revision : null};
}
