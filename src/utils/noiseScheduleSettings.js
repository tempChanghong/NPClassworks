export const NOISE_SCHEDULE_DEFAULTS = Object.freeze({
  enabled: true,
  startTime: "19:15",
  endTime: "21:30",
});

export const NOISE_SCHEDULE_SETTINGS_EVENT = "classworks-noise-schedule-settings-changed";

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function sanitizeNoiseScheduleSettings(value = {}) {
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : NOISE_SCHEDULE_DEFAULTS.enabled,
    startTime: TIME_PATTERN.test(value.startTime) ? value.startTime : NOISE_SCHEDULE_DEFAULTS.startTime,
    endTime: TIME_PATTERN.test(value.endTime) ? value.endTime : NOISE_SCHEDULE_DEFAULTS.endTime,
  };
}

export function noiseScheduleSettingsKey(bindingId) {
  return `classworks-v2-noise-schedule:${bindingId || "unbound"}`;
}

export function loadNoiseScheduleSettings(bindingId, storage = localStorage) {
  try {
    return sanitizeNoiseScheduleSettings(JSON.parse(storage.getItem(noiseScheduleSettingsKey(bindingId))) || {});
  } catch {
    return {...NOISE_SCHEDULE_DEFAULTS};
  }
}

export function saveNoiseScheduleSettings(bindingId, settings, storage = localStorage) {
  const sanitized = sanitizeNoiseScheduleSettings(settings);
  storage.setItem(noiseScheduleSettingsKey(bindingId), JSON.stringify(sanitized));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new window.CustomEvent(NOISE_SCHEDULE_SETTINGS_EVENT, {
      detail: {bindingId: bindingId || "", settings: sanitized},
    }));
  }
  return sanitized;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isWithinNoiseSchedule(settings, date = new Date()) {
  const sanitized = sanitizeNoiseScheduleSettings(settings);
  if (!sanitized.enabled || sanitized.startTime === sanitized.endTime) return false;
  const current = date.getHours() * 60 + date.getMinutes();
  const start = timeToMinutes(sanitized.startTime);
  const end = timeToMinutes(sanitized.endTime);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

export function noiseScheduleWindowKey(settings, date = new Date()) {
  if (!isWithinNoiseSchedule(settings, date)) return "";
  const sanitized = sanitizeNoiseScheduleSettings(settings);
  const start = timeToMinutes(sanitized.startTime);
  const end = timeToMinutes(sanitized.endTime);
  const windowStart = new Date(date);
  const current = date.getHours() * 60 + date.getMinutes();
  if (start > end && current < end) windowStart.setDate(windowStart.getDate() - 1);
  const year = windowStart.getFullYear();
  const month = String(windowStart.getMonth() + 1).padStart(2, "0");
  const day = String(windowStart.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}:${sanitized.startTime}-${sanitized.endTime}`;
}
