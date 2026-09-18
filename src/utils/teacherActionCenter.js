// Keep the full collection for refresh recovery; derive the current day's view
// and every badge/count from the same items, including after midnight.
export function todayActionCenter(center, boardDate) {
  const items = (center?.items || []).filter(item =>
    String(item.publication?.boardDate || "").slice(0, 10) === boardDate
    && item.publication?.isCertified !== true);
  const summary = {total: items.length, changedAfterCertified: 0, createdByScreen: 0, other: 0, dueSoon: 0, overdue: 0};
  for (const item of items) {
    if (item.reason === "CHANGED_AFTER_CERTIFICATION") summary.changedAfterCertified++;
    else if (item.reason === "CREATED_BY_SCREEN") summary.createdByScreen++;
    else summary.other++;
    if (item.dueSoon) summary.dueSoon++;
    if (item.overdue) summary.overdue++;
  }
  return {...center, items, total: items.length, summary};
}
