export const SCREEN_DISPLAY_DEFAULTS = Object.freeze({
  fontScale: 130,
  density: "compact",
  columns: "auto",
  showSecondaryMetadata: true,
  urgentNoticeSound: true,
  backgroundSystemNotification: true,
  antiBurnInShift: false,
  performanceMode: "efficient",
});

const DENSITIES = new Set(["compact", "comfortable"]);
const COLUMNS = new Set(["auto", "1", "2", "3", "4", "5"]);
const PERFORMANCE_MODES = new Set(["efficient", "standard"]);

export function calculateScreenFeedColumns(width, fontScale = SCREEN_DISPLAY_DEFAULTS.fontScale) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeScale = Math.min(200, Math.max(90, Number(fontScale) || SCREEN_DISPLAY_DEFAULTS.fontScale));
  const minimumCardWidth = Math.round(390 * (safeScale / 100));
  const maximumColumns = safeWidth >= 3400 ? 5 : safeWidth >= 2300 ? 4 : 3;
  return Math.max(1, Math.min(
    maximumColumns,
    Math.floor((safeWidth + 16) / (minimumCardWidth + 16)),
  ));
}

export function sanitizeScreenDisplaySettings(value = {}) {
  const fontScale = Number(value.fontScale);
  return {
    fontScale: Number.isFinite(fontScale)
      ? Math.min(200, Math.max(90, Math.round(fontScale / 10) * 10))
      : SCREEN_DISPLAY_DEFAULTS.fontScale,
    density: DENSITIES.has(value.density) ? value.density : SCREEN_DISPLAY_DEFAULTS.density,
    columns: COLUMNS.has(String(value.columns)) ? String(value.columns) : SCREEN_DISPLAY_DEFAULTS.columns,
    showSecondaryMetadata: typeof value.showSecondaryMetadata === "boolean"
      ? value.showSecondaryMetadata
      : SCREEN_DISPLAY_DEFAULTS.showSecondaryMetadata,
    urgentNoticeSound: typeof value.urgentNoticeSound === "boolean"
      ? value.urgentNoticeSound
      : SCREEN_DISPLAY_DEFAULTS.urgentNoticeSound,
    backgroundSystemNotification: typeof value.backgroundSystemNotification === "boolean"
      ? value.backgroundSystemNotification
      : SCREEN_DISPLAY_DEFAULTS.backgroundSystemNotification,
    antiBurnInShift: typeof value.antiBurnInShift === "boolean"
      ? value.antiBurnInShift
      : SCREEN_DISPLAY_DEFAULTS.antiBurnInShift,
    performanceMode: PERFORMANCE_MODES.has(value.performanceMode)
      ? value.performanceMode
      : SCREEN_DISPLAY_DEFAULTS.performanceMode,
  };
}

export function screenDisplaySettingsKey(bindingId) {
  return `classworks-v2-screen-display:${bindingId || "unbound"}`;
}

export function loadScreenDisplaySettings(bindingId, storage = localStorage) {
  try {
    return sanitizeScreenDisplaySettings(JSON.parse(storage.getItem(screenDisplaySettingsKey(bindingId))) || {});
  } catch {
    return {...SCREEN_DISPLAY_DEFAULTS};
  }
}

export function saveScreenDisplaySettings(bindingId, settings, storage = localStorage) {
  const sanitized = sanitizeScreenDisplaySettings(settings);
  storage.setItem(screenDisplaySettingsKey(bindingId), JSON.stringify(sanitized));
  return sanitized;
}
