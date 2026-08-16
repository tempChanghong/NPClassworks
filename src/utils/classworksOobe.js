export const CLASSWORKS_OOBE_VERSION = 1;
const OOBE_STORAGE_KEY = "classworks-v2-oobe";
const ROLES = new Set(["student", "teacher", "screen"]);

export function sanitizeClassworksOobeState(value = {}) {
  return {
    version: Number(value.version) || 0,
    completed: value.completed === true,
    roleHint: ROLES.has(value.roleHint) ? value.roleHint : "",
    completedAt: Number.isFinite(Number(value.completedAt)) ? Number(value.completedAt) : 0,
  };
}

export function loadClassworksOobeState(storage = localStorage) {
  try {
    return sanitizeClassworksOobeState(JSON.parse(storage.getItem(OOBE_STORAGE_KEY)) || {});
  } catch {
    return sanitizeClassworksOobeState();
  }
}

export function saveClassworksOobeState(value, storage = localStorage) {
  const state = sanitizeClassworksOobeState(value);
  try {
    storage.setItem(OOBE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // OOBE must remain usable when browser storage is restricted.
  }
  return state;
}

export function rememberClassworksOobeRole(role, storage = localStorage) {
  const current = loadClassworksOobeState(storage);
  return saveClassworksOobeState({
    ...current,
    version: CLASSWORKS_OOBE_VERSION,
    completed: false,
    roleHint: role,
  }, storage);
}

export function completeClassworksOobe(role, storage = localStorage, now = Date.now()) {
  return saveClassworksOobeState({
    version: CLASSWORKS_OOBE_VERSION,
    completed: true,
    roleHint: role,
    completedAt: now,
  }, storage);
}

export function shouldShowClassworksOobe({state, hasStudentSelection, isTeacherSignedIn, hasScreenSession}) {
  if (hasScreenSession || isTeacherSignedIn || hasStudentSelection) return false;
  const normalized = sanitizeClassworksOobeState(state);
  return normalized.version !== CLASSWORKS_OOBE_VERSION || !normalized.completed || !normalized.roleHint;
}

export function screenOobeStorageKey(bindingId) {
  return `classworks-v2-screen-oobe:${bindingId || "unbound"}`;
}

export function isScreenOobeComplete(bindingId, storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(screenOobeStorageKey(bindingId))) || {};
    return value.version === CLASSWORKS_OOBE_VERSION && value.completed === true;
  } catch {
    return false;
  }
}

export function completeScreenOobe(bindingId, storage = localStorage, now = Date.now()) {
  try {
    storage.setItem(screenOobeStorageKey(bindingId), JSON.stringify({
      version: CLASSWORKS_OOBE_VERSION,
      completed: true,
      completedAt: now,
    }));
  } catch {
    // A failed persistence attempt should not trap the screen in setup.
  }
}

export function resetScreenOobe(bindingId, storage = localStorage) {
  try {
    storage.removeItem(screenOobeStorageKey(bindingId));
  } catch {
    // Ignore storage restrictions; the explicit OOBE route still opens setup.
  }
}
