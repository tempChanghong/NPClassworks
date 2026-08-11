const BOARD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayBoardDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sanitizeBoardDate(value, fallback = todayBoardDate()) {
  if (typeof value !== "string" || !BOARD_DATE_PATTERN.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && todayBoardDate(parsed) === value ? value : fallback;
}

export function shiftBoardDate(value, days) {
  const parsed = new Date(`${sanitizeBoardDate(value)}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return todayBoardDate(parsed);
}

export function boardDateRelativeLabel(value, today = todayBoardDate()) {
  if (value === today) return "今天";
  if (value === shiftBoardDate(today, -1)) return "昨天";
  if (value === shiftBoardDate(today, 1)) return "明天";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${sanitizeBoardDate(value)}T12:00:00`));
}
