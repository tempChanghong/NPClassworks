const blockers = new WeakMap();

export function registerScreenReloadBlocker(store, isBusy) {
  if (!blockers.has(store)) blockers.set(store, new Set());
  const entries = blockers.get(store);
  entries.add(isBusy);
  return () => entries.delete(isBusy);
}

export function isScreenReloadBlocked(store) {
  if (store.screenSyncing) return true;
  return [...(blockers.get(store) || [])].some(check => check());
}
