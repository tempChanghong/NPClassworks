const VERSION = 1;
const MAX_RECENT = 5;
const MAX_FAVORITES = 8;

export function teacherTargetPreferencesKey(accountId) {
  return `classworks-v2-teacher-targets:${accountId || "anonymous"}`;
}

export function teacherTargetSyncStateKey(accountId) {
  return `classworks-v2-teacher-targets-sync:${accountId || "anonymous"}`;
}

function normalizedCombination(value) {
  const targetWorkspaceIds = [...new Set(
    (Array.isArray(value?.targetWorkspaceIds) ? value.targetWorkspaceIds : [])
      .filter((id) => typeof id === "string" && id),
  )].sort();
  if (!targetWorkspaceIds.length) return null;
  const savedAt = typeof value?.savedAt === "string" && Number.isFinite(Date.parse(value.savedAt))
    ? new Date(value.savedAt).toISOString()
    : new Date().toISOString();
  return {
    type: value?.type === "NOTICE" ? "NOTICE" : "ASSIGNMENT",
    subjectId: value?.type === "NOTICE" ? null : value?.subjectId || null,
    targetWorkspaceIds,
    savedAt,
  };
}

export function teacherTargetCombinationId(value) {
  const normalized = normalizedCombination(value);
  return normalized
    ? [normalized.type, normalized.subjectId || "", ...normalized.targetWorkspaceIds].join(":")
    : "";
}

export function sanitizeTeacherTargetPreferences(value = {}) {
  const unique = (items, limit) => {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).map(normalizedCombination).filter((item) => {
      const id = teacherTargetCombinationId(item);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, limit);
  };
  return {
    version: VERSION,
    favorites: unique(value.favorites, MAX_FAVORITES),
    recent: unique(value.recent, MAX_RECENT),
  };
}

export function loadTeacherTargetPreferences(accountId, storage = localStorage) {
  try {
    return sanitizeTeacherTargetPreferences(
      JSON.parse(storage.getItem(teacherTargetPreferencesKey(accountId))) || {},
    );
  } catch {
    return sanitizeTeacherTargetPreferences();
  }
}

export function loadTeacherTargetSyncState(accountId, storage = localStorage) {
  try {
    // Keep edits and their sync journal in one storage write. Read the old key
    // only when migrating preferences written before the journal existed.
    const record = JSON.parse(storage.getItem(teacherTargetPreferencesKey(accountId)));
    const value = record?.syncState || JSON.parse(storage.getItem(teacherTargetSyncStateKey(accountId))) || {};
    return {
      dirty: value.dirty === true,
      lastSyncedAt: value.lastSyncedAt || null,
      revision: Number.isSafeInteger(value.revision) ? value.revision : 0,
      removedFavoriteIds: [...new Set((Array.isArray(value.removedFavoriteIds) ? value.removedFavoriteIds : [])
        .filter(id => typeof id === "string" && id))],
      // null identifies legacy snapshots whose pending additions were not recorded.
      addedFavoriteIds: Array.isArray(value.addedFavoriteIds)
        ? [...new Set(value.addedFavoriteIds.filter(id => typeof id === "string" && id))] : null,
    };
  } catch {
    return {dirty: false, lastSyncedAt: null, revision: 0, removedFavoriteIds: [], addedFavoriteIds: null};
  }
}

export function saveTeacherTargetPreferences(
  accountId,
  preferences,
  storage = localStorage,
  {dirty = true, removedFavoriteIds} = {},
) {
  const sanitized = sanitizeTeacherTargetPreferences(preferences);
  const previous = loadTeacherTargetSyncState(accountId, storage);
  const previousIds = new Set(loadTeacherTargetPreferences(accountId, storage).favorites.map(teacherTargetCombinationId));
  const nextIds = new Set(sanitized.favorites.map(teacherTargetCombinationId));
  const added = new Set(previous.addedFavoriteIds ?? (previous.dirty || !previous.lastSyncedAt ? previousIds : []));
  const removed = new Set(removedFavoriteIds ?? previous.removedFavoriteIds);
  for (const id of previousIds) if (!nextIds.has(id)) { removed.add(id); added.delete(id); }
  for (const id of nextIds) if (!previousIds.has(id)) { added.add(id); removed.delete(id); }
  const syncState = {
    dirty,
    lastSyncedAt: dirty ? previous.lastSyncedAt : new Date().toISOString(),
    revision: previous.revision + 1,
    removedFavoriteIds: dirty ? [...removed] : [],
    addedFavoriteIds: dirty ? [...added].filter(id => nextIds.has(id)) : [],
  };
  storage.setItem(teacherTargetPreferencesKey(accountId), JSON.stringify({...sanitized, syncState}));
  return sanitized;
}

export function reconcileTeacherTargetPreferences(local, remote, syncState) {
  const removed = new Set(syncState.removedFavoriteIds);
  const added = syncState.addedFavoriteIds == null ? null : new Set(syncState.addedFavoriteIds);
  // Filter before the combined favorites limit, so a removed entry cannot
  // displace a different device's addition from the merged list.
  return mergeTeacherTargetPreferences(...[local, remote].map((value, index) => ({
    ...value,
    favorites: value.favorites.filter(item => {
      const id = teacherTargetCombinationId(item);
      return !removed.has(id) && (index === 1 || added === null || added.has(id));
    }),
  })));
}

export function mergeTeacherTargetPreferences(...values) {
  const mergeList = (key) => values.flatMap((value) => sanitizeTeacherTargetPreferences(value)[key])
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
  return sanitizeTeacherTargetPreferences({
    favorites: mergeList("favorites"),
    recent: mergeList("recent"),
  });
}

export function rememberTeacherTargets(accountId, combination, storage = localStorage) {
  const preferences = loadTeacherTargetPreferences(accountId, storage);
  const normalized = normalizedCombination(combination);
  if (!normalized) return preferences;
  const id = teacherTargetCombinationId(normalized);
  return saveTeacherTargetPreferences(accountId, {
    ...preferences,
    recent: [normalized, ...preferences.recent.filter(
      (item) => teacherTargetCombinationId(item) !== id,
    )],
  }, storage);
}

export function toggleFavoriteTeacherTargets(accountId, combination, storage = localStorage) {
  const preferences = loadTeacherTargetPreferences(accountId, storage);
  const normalized = normalizedCombination(combination);
  if (!normalized) return preferences;
  const id = teacherTargetCombinationId(normalized);
  const exists = preferences.favorites.some((item) => teacherTargetCombinationId(item) === id);
  const removed = new Set(loadTeacherTargetSyncState(accountId, storage).removedFavoriteIds);
  if (exists) removed.add(id);
  else removed.delete(id);
  return saveTeacherTargetPreferences(accountId, {
    ...preferences,
    favorites: exists
      ? preferences.favorites.filter((item) => teacherTargetCombinationId(item) !== id)
      : [normalized, ...preferences.favorites],
  }, storage, {removedFavoriteIds: [...removed]});
}
