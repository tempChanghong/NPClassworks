export const SCREEN_DISPLAY_DEFAULTS = Object.freeze({
  fontScale: 130,
  density: "compact",
  columns: "auto",
  showSecondaryMetadata: true,
  urgentNoticeSound: true,
});

const DENSITIES = new Set(["compact", "comfortable"]);
const COLUMNS = new Set(["auto", "1", "2", "3"]);

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
