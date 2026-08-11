export const CLASSROOM_TOOL_IDS = Object.freeze(["attendance", "noise", "random", "exam"]);

export const CLASSROOM_TOOL_DEFAULTS = Object.freeze({
  enabledToolIds: [...CLASSROOM_TOOL_IDS],
});

export function sanitizeClassroomToolSettings(value = {}) {
  const requested = Array.isArray(value.enabledToolIds) ? value.enabledToolIds : CLASSROOM_TOOL_IDS;
  return {
    enabledToolIds: CLASSROOM_TOOL_IDS.filter((id) => requested.includes(id)),
  };
}

export function classroomToolSettingsKey(bindingId) {
  return `classworks-v2-classroom-tools:${bindingId || "unbound"}`;
}

export function loadClassroomToolSettings(bindingId, storage = localStorage) {
  try {
    return sanitizeClassroomToolSettings(JSON.parse(storage.getItem(classroomToolSettingsKey(bindingId))) || {});
  } catch {
    return {...CLASSROOM_TOOL_DEFAULTS, enabledToolIds: [...CLASSROOM_TOOL_IDS]};
  }
}

export function saveClassroomToolSettings(bindingId, settings, storage = localStorage) {
  const sanitized = sanitizeClassroomToolSettings(settings);
  storage.setItem(classroomToolSettingsKey(bindingId), JSON.stringify(sanitized));
  return sanitized;
}
