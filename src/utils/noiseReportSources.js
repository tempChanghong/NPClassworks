// 0.7 records identify scheduled sessions; absence of a record cannot prove
// that a 0.6 report was manual. Report capture timestamps remain unchanged.
const calendarPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;
const versionPattern = /^[0-9a-f]{64}$/;

function validCalendar(value) {
  if (typeof value !== 'string') return false;
  const match = calendarPattern.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 2000 && year <= 9998 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour < 24 && minute < 60 && second < 60;
}

export const schoolCalendarText = value => validCalendar(value) ? value.replace('T', ' ').slice(0, 19) : '学校时间未确认';

export function scheduledReportSource(sessionId, sessions) {
  if (typeof sessionId !== 'string' || !sessionId || !Array.isArray(sessions)) return null;
  const matches = sessions.filter(item => item?.sessionId === sessionId);
  if (!matches.length) return null;
  const first = matches[0];
  if (typeof first.version !== 'string' || !versionPattern.test(first.version)
    || !validCalendar(first.window?.start) || !validCalendar(first.window?.end)
    || first.window.start >= first.window.end) return null;
  // Contradictory historical records must not be resolved by array order.
  if (matches.some(item => item.version !== first.version || item.window?.start !== first.window.start || item.window?.end !== first.window.end)) return null;
  return {version: first.version, window: {start: first.window.start, end: first.window.end}};
}
