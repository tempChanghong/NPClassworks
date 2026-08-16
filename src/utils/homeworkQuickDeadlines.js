export const DEFAULT_HOMEWORK_QUICK_DEADLINES = Object.freeze([
  Object.freeze({label: "明早 7:30", dayOffset: 1, time: "07:30"}),
  Object.freeze({label: "明天 12:00", dayOffset: 1, time: "12:00"}),
  Object.freeze({label: "明晚 18:00", dayOffset: 1, time: "18:00"}),
  Object.freeze({label: "后早 7:30", dayOffset: 2, time: "07:30"}),
  Object.freeze({label: "下周一 7:30", dateRule: "next-weekday", weekday: 1, time: "07:30"}),
]);

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function sanitizeHomeworkQuickDeadlines(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    return DEFAULT_HOMEWORK_QUICK_DEADLINES.map((item) => ({...item}));
  }
  const normalized = value.map((item) => {
    const common = {
      label: typeof item?.label === "string" ? item.label.trim() : "",
      time: typeof item?.time === "string" ? item.time.trim() : "",
    };
    if (item?.dateRule === "next-weekday") {
      return {...common, dateRule: "next-weekday", weekday: Number(item.weekday)};
    }
    return {...common, dayOffset: Number(item?.dayOffset)};
  });
  if (normalized.some((item) => (
    !item.label || item.label.length > 16 ||
    (item.dateRule === "next-weekday"
      ? !Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6
      : !Number.isInteger(item.dayOffset) || item.dayOffset < 0 || item.dayOffset > 14) ||
    !TIME_PATTERN.test(item.time)
  ))) return DEFAULT_HOMEWORK_QUICK_DEADLINES.map((item) => ({...item}));
  return normalized;
}

export function resolveHomeworkQuickDeadline(preset, baseDate = new Date()) {
  const [hour, minute] = preset.time.split(":").map(Number);
  const result = new Date(baseDate);
  if (preset.dateRule === "next-weekday") {
    const daysUntil = (preset.weekday - result.getDay() + 7) % 7 || 7;
    result.setDate(result.getDate() + daysUntil);
  } else {
    result.setDate(result.getDate() + preset.dayOffset);
  }
  result.setHours(hour, minute, 0, 0);
  return result;
}
