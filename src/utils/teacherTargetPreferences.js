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
    const value = JSON.parse(storage.getItem(teacherTargetSyncStateKey(accountId))) || {};
    return {dirty: value.dirty === true, lastSyncedAt: value.lastSyncedAt || null};
  } catch {
    return {dirty: false, lastSyncedAt: null};
  }
}

export function saveTeacherTargetPreferences(
  accountId,
  preferences,
  storage = localStorage,
  {dirty = true} = {},
) {
  const sanitized = sanitizeTeacherTargetPreferences(preferences);
  storage.setItem(teacherTargetPreferencesKey(accountId), JSON.stringify(sanitized));
  storage.setItem(teacherTargetSyncStateKey(accountId), JSON.stringify({
    dirty,
    lastSyncedAt: dirty ? loadTeacherTargetSyncState(accountId, storage).lastSyncedAt : new Date().toISOString(),
  }));
  return sanitized;
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
  return saveTeacherTargetPreferences(accountId, {
    ...preferences,
    favorites: exists
      ? preferences.favorites.filter((item) => teacherTargetCombinationId(item) !== id)
      : [normalized, ...preferences.favorites],
  }, storage);
}
